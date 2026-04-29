import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/content-archive'

/** Sprint 8：archive / noindex 占位。 */
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
      objective: 'Archive low-value URL (placeholder)',
      recommendedNextSkill: '',
    },
  })
}
