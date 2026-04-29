import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost, keywordDataLocationAndLanguage } from '@/services/integrations/dataforseo/client'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/serp-audit'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { q?: string }
  const loc = await keywordDataLocationAndLanguage()
  if (!body.q) {
    return Response.json({ error: 'q required' }, { status: 400 })
  }
  try {
    const r = await dataForSeoPost('/v3/serp/google/organic/live/advanced', [
      {
        language_code: loc.language_code,
        location_code: loc.location_code,
        keyword: body.q,
      },
    ])
    return Response.json({ ok: true, r })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) })
  }
}
