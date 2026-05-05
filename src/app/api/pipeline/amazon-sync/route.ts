import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/amazon-sync'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    asin?: string
    siteId?: number
    tenantId?: number
  }
  if (!body.asin) {
    return Response.json({ error: 'asin required' }, { status: 400 })
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
    const r = await dataForSeoPost('/v3/merchant/google/sellers', [{ asin: body.asin }])
    return Response.json({ ok: true, r })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
