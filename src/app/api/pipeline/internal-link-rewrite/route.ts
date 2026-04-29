import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/internal-link-rewrite'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    articleId?: string
    mergeTargetArticleId?: string | null
    reason?: string
  }

  return Response.json({
    ok: true,
    articleId: body.articleId ?? null,
    mergeTargetArticleId: body.mergeTargetArticleId ?? null,
    reason: body.reason ?? 'unknown',
    /** Later: load inbound edges from `page-link-graph`, patch Lexical nodes, optional redirects. */
    actions: {
      graphQuery: 'placeholder',
      lexicalRewrite: 'placeholder',
      redirectCollection: 'placeholder',
    },
  })
}
