import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost } from '@/services/integrations/dataforseo/client'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/backlink-scan'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { target?: string }
  if (!body.target) {
    return Response.json({ error: 'target domain required' }, { status: 400 })
  }
  try {
    const r = await dataForSeoPost('/v3/backlinks/summary/live', [{ target: body.target }])
    return Response.json({ ok: true, r })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
