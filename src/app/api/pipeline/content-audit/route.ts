import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/content-audit'

/** Sprint 8：on-page / quality 审计占位 — 后续接 OpenRouter + on-page-seo-auditor。 */
export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { articleId?: string }
  return Response.json({
    ok: true,
    placeholder: true,
    articleId: body.articleId ?? null,
    handoff: {
      status: 'DONE',
      objective: 'On-page audit (placeholder)',
      recommendedNextSkill: 'content-refresher',
      keyFindings: 'Wire DFS + WebFetch + LLM batch audit.',
    },
  })
}
