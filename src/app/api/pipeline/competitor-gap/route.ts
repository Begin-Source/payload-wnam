import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { openrouterChat } from '@/services/integrations/openrouter/chat'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'
import {
  COMPETITOR_GAP_SYSTEM,
  COMPETITOR_GAP_USER,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'
import { DEFAULT_COMPETITOR_GAP_USER_TEMPLATE } from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import { resolveOptionalPipelineTenant } from '@/utilities/openRouterTenantPrompts/resolveOptionalPipelineTenant'
import { pickPipelineOpenRouterModel } from '@/utilities/pipelineSettingShape'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/competitor-gap'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    topic?: string
    urls?: string[]
    tenantId?: number
    siteId?: number
  }
  const payload = await getPayload({ config: configPromise })
  const tenantId = await resolveOptionalPipelineTenant(payload, {
    tenantId: body.tenantId ?? null,
    siteId: body.siteId ?? null,
  })
  const topic = body.topic || 'n/a'
  const competitor_urls = (body.urls || []).join('\n')
  const vars = { topic, competitor_urls }
  const defaultSystem = getSkillPrompt('competitor-analysis')
  const defaultUser = substitutePromptPlaceholders(DEFAULT_COMPETITOR_GAP_USER_TEMPLATE, vars)
  const { system, user } = await resolveTenantPromptPair(
    payload,
    tenantId,
    COMPETITOR_GAP_SYSTEM,
    COMPETITOR_GAP_USER,
    { system: defaultSystem, user: defaultUser },
    vars,
  )
  const merged = await resolveMergedForPipelineRoute({
    payload,
    tenantId,
    siteId: body.siteId ?? null,
  })
  const model = pickPipelineOpenRouterModel(merged, 'custom')
  const text = await openrouterChat(model, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
  return Response.json({ ok: true, text })
}
