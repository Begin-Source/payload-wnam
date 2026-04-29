import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { normalizeGenerateDomainBody } from '@/utilities/domainGeneration/normalizeRequest'
import { runDomainGenerationForSite } from '@/utilities/domainGeneration/runDomainGenerationForSite'

export const dynamic = 'force-dynamic'

const PATH = '/api/sites/generate-domain'

/**
 * n8n「Sites | Executor | Generate Domain」等价：受众 AI + 域名 AI + Spaceship 可查 + 写回 Sites。
 * 鉴权：`x-internal-token: PAYLOAD_SECRET`（与 pipeline 一致）。
 *
 * Body: `{ keys?: string[] | string, site_ids?, site_id?, id?, force?, ai_model? }`
 */
export async function GET(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  return Response.json({
    ok: true,
    path: PATH,
    hint: 'POST JSON: { keys: ["1","2"] | "1,2", force?: boolean, ai_model?: string }',
    env: 'SPACESHIP_API_KEY, SPACESHIP_API_SECRET, OPENAI_API_KEY or OPENROUTER_API_KEY',
  })
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  let normalized: ReturnType<typeof normalizeGenerateDomainBody>
  try {
    normalized = normalizeGenerateDomainBody(body)
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  const results: unknown[] = []

  for (const siteId of normalized.siteIds) {
    const r = await runDomainGenerationForSite(payload, siteId, {
      force: normalized.force,
      aiModel: normalized.aiModel,
    })
    if (r.ok) {
      results.push({
        site_id: r.detail.site_id,
        ok: true,
        force: r.detail.force,
        current_domain: r.detail.current_domain,
        applied_domain: r.detail.applied_domain,
        selected_audience: r.detail.selected_audience,
        audience_candidates: r.detail.audience_candidates,
        selected_domain: r.detail.selected_domain,
        available_domains: r.detail.available_domains,
        checked_domains: r.detail.checked_domains,
        status: r.detail.status,
        message: r.detail.message,
      })
    } else {
      results.push({
        site_id: r.siteId,
        ok: false,
        error: r.error,
      })
    }
  }

  return Response.json({
    ok: true,
    ran: normalized.siteIds.length,
    results,
  })
}
