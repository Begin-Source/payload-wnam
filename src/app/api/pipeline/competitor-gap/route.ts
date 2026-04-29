import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { openrouterChat } from '@/services/integrations/openrouter/chat'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/competitor-gap'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { topic?: string; urls?: string[] }
  const text = await openrouterChat('openai/gpt-4o-mini', [
    { role: 'system', content: getSkillPrompt('competitor-analysis') },
    {
      role: 'user',
      content: `Topic: ${body.topic || 'n/a'}\nCompetitor URLs: ${(body.urls || []).join('\n')}`,
    },
  ])
  return Response.json({ ok: true, text })
}
