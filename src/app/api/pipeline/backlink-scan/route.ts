import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { extractDataForSeoCostUsd } from '@/services/integrations/dataforseo/extractDataForSeoCostUsd'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/backlink-scan'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    target?: string
    siteId?: number
    tenantId?: number
  }
  if (!body.target) {
    return Response.json({ error: 'target domain required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const merged = await resolveMergedForPipelineRoute({
    payload,
    siteId: body.siteId ?? null,
    tenantId: body.tenantId ?? null,
  })
  if (!merged.dataForSeoEnabled) {
    return Response.json(
      { ok: false, error: 'DataForSEO disabled in pipeline-settings / profile' },
      { status: 400 },
    )
  }

  try {
    const r = await dataForSeoPost('/v3/backlinks/summary/live', [{ target: body.target }])
    const sid = body.siteId
    if (typeof sid === 'number' && Number.isFinite(sid)) {
      try {
        const usd = extractDataForSeoCostUsd(r)
        if (usd > 0) {
          await incrementSiteQuotaUsage(payload, sid, { dataForSeoUsd: usd })
        }
      } catch {
        /* quota optional */
      }
    }
    return Response.json({ ok: true, r })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
