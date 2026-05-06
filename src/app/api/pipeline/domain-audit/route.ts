import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'
import {
  DOMAIN_AUDIT_SYSTEM,
  DOMAIN_AUDIT_USER,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'
import { DEFAULT_DOMAIN_AUDIT_USER_TEMPLATE } from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import { resolveOptionalPipelineTenant } from '@/utilities/openRouterTenantPrompts/resolveOptionalPipelineTenant'
import { pickPipelineOpenRouterModel } from '@/utilities/pipelineSettingShape'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/domain-audit'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    pageUrl?: string
    htmlExcerpt?: string
    tenantId?: number
    siteId?: number
  }
  const payload = await getPayload({ config: configPromise })
  const tenantId = await resolveOptionalPipelineTenant(payload, {
    tenantId: body.tenantId ?? null,
    siteId: body.siteId ?? null,
  })
  const pageUrl = body.pageUrl ?? ''
  const htmlExcerpt = (body.htmlExcerpt || '').slice(0, 4000)
  const vars = { page_url: pageUrl, html_excerpt: htmlExcerpt }
  const defaultSystem = getSkillPrompt('domain-authority-auditor')
  const defaultUser = substitutePromptPlaceholders(DEFAULT_DOMAIN_AUDIT_USER_TEMPLATE, vars)
  const { system, user } = await resolveTenantPromptPair(
    payload,
    tenantId,
    DOMAIN_AUDIT_SYSTEM,
    DOMAIN_AUDIT_USER,
    { system: defaultSystem, user: defaultUser },
    vars,
  )
  const merged = await resolveMergedForPipelineRoute({
    payload,
    tenantId,
    siteId: body.siteId ?? null,
  })
  const model = pickPipelineOpenRouterModel(merged, 'custom')
  const r = await openrouterChatWithMeta(model, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
  const siteId = body.siteId
  if (typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      await recordOpenRouterAiCost({
        payload,
        target: { collection: 'sites', id: siteId },
        model,
        usage: r.usage,
        raw: r.raw,
        kind: 'domain_audit',
      })
    } catch {
      /* optional */
    }
  }
  return Response.json({ ok: true, t: r.text })
}
