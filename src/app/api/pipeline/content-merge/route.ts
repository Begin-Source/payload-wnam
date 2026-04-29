import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/content-merge'

/** Sprint 8：merge + 301 占位 — 后续写 redirects + pillar 更新。 */
export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { articleId?: string; mergeTargetArticleId?: string }
  return Response.json({
    ok: true,
    placeholder: true,
    articleId: body.articleId ?? null,
    mergeTargetArticleId: body.mergeTargetArticleId ?? null,
    handoff: {
      status: 'DONE_WITH_CONCERNS',
      objective: 'Merge dying article into pillar (placeholder)',
      recommendedNextSkill: '',
    },
  })
}
