import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'
import {
  ALERT_EVAL_SYSTEM,
  ALERT_EVAL_USER,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'
import { DEFAULT_ALERT_EVAL_USER_TEMPLATE } from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import { resolveOptionalPipelineTenant } from '@/utilities/openRouterTenantPrompts/resolveOptionalPipelineTenant'
import { pickPipelineOpenRouterModel } from '@/utilities/pipelineSettingShape'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/alert-eval'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    metricsJson?: string
    tenantId?: number
    siteId?: number
  }
  const payload = await getPayload({ config: configPromise })
  const tenantId = await resolveOptionalPipelineTenant(payload, {
    tenantId: body.tenantId ?? null,
    siteId: body.siteId ?? null,
  })
  const metrics_json = body.metricsJson || '{}'
  const vars = { metrics_json }
  const defaultSystem = getSkillPrompt('alert-manager')
  const defaultUser = substitutePromptPlaceholders(DEFAULT_ALERT_EVAL_USER_TEMPLATE, vars)
  const { system, user } = await resolveTenantPromptPair(
    payload,
    tenantId,
    ALERT_EVAL_SYSTEM,
    ALERT_EVAL_USER,
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
        kind: 'alert_eval',
      })
    } catch {
      /* optional */
    }
  }
  return Response.json({ ok: true, t: r.text })
}
