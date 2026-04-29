import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/amazon-sync'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { asin?: string }
  if (!body.asin) {
    return Response.json({ error: 'asin required' }, { status: 400 })
  }
  try {
    const r = await dataForSeoPost('/v3/merchant/google/sellers', [{ asin: body.asin }])
    return Response.json({ ok: true, r })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
