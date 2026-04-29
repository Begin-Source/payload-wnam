import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { togetherImageGenerate } from '@/services/integrations/together/hidream'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/image-generate'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { prompt: string; siteId?: number }
  if (!body.prompt) {
    return Response.json({ error: 'prompt required' }, { status: 400 })
  }
  let url: string
  try {
    const r = await togetherImageGenerate(body.prompt)
    url = r.url
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
  // Persist to `media` + R2 in production: fetch(url) -> payload.create with buffer + filename
  return Response.json({ ok: true, url, prompt: body.prompt })
}
