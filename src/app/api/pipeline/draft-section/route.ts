import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runSectionPrompt } from '@/services/writing/sectionExecutor'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/draft-section'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    model?: string
    sectionId?: string
    sectionType?: string
    previousSectionSummary?: string
    globalContext?: string
  }
  if (!body.sectionId) {
    return Response.json({ error: 'sectionId required' }, { status: 400 })
  }
  const text = await runSectionPrompt({
    model: body.model || 'openai/gpt-4o-mini',
    sectionId: body.sectionId,
    sectionType: body.sectionType || 'custom',
    previousSectionSummary: body.previousSectionSummary,
    globalContext: body.globalContext || '',
  })
  return Response.json({ ok: true, text })
}
