import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { finalizeArticleBodyText } from '@/services/writing/finalizePass'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/draft-finalize'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { bodyText?: string }
  if (!body.bodyText) {
    return Response.json({ error: 'bodyText required' }, { status: 400 })
  }
  return Response.json({ ok: true, text: finalizeArticleBodyText(body.bodyText) })
}
