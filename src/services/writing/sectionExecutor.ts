import { openrouterChat } from '@/services/integrations/openrouter/chat'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'

export async function runSectionPrompt(input: {
  model: string
  sectionId: string
  sectionType: string
  previousSectionSummary?: string
  globalContext: string
}): Promise<string> {
  const system = getSkillPrompt('seo-content-writer', { contentType: input.sectionType })
  const user = [
    `sectionId: ${input.sectionId}`,
    `sectionType: ${input.sectionType}`,
    input.previousSectionSummary ? `previous: ${input.previousSectionSummary}` : '',
    `context:\n${input.globalContext}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return openrouterChat(input.model, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
}
