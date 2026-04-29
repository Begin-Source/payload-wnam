import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'
import { openrouterChat } from '@/services/integrations/openrouter/chat'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/alert-eval'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { metricsJson?: string }
  const t = await openrouterChat('openai/gpt-4o-mini', [
    { role: 'system', content: getSkillPrompt('alert-manager') },
    { role: 'user', content: body.metricsJson || '{}' },
  ])
  return Response.json({ ok: true, t })
}
