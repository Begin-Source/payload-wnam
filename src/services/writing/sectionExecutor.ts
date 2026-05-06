import type { Payload } from 'payload'

import { openrouterChatWithMeta, type OpenRouterChatResult } from '@/services/integrations/openrouter/chat'
import { getSkillPrompt } from '@/services/prompts/skillPrompts'
import {
  DRAFT_SECTION_SYSTEM,
  DRAFT_SECTION_USER,
} from '@/utilities/domainGeneration/promptKeys'
import { buildDraftSectionPromptDefaults } from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'

export async function runSectionPrompt(
  payload: Payload,
  tenantId: number | null,
  input: {
    model: string
    sectionId: string
    sectionType: string
    previousSectionSummary?: string
    globalContext: string
    /** From merged `eeatWeights` + content type (CORE-EEAT prompt context). */
    eeatWeights?: Record<string, number>
    /** Extra Tavily / research JSON for `research_per_section`. */
    researchSlice?: string
  },
): Promise<{
  text: string
  usage?: OpenRouterChatResult['usage']
  raw?: unknown
}> {
  const defaultSystem = getSkillPrompt('seo-content-writer', {
    contentType: input.sectionType,
    ...(input.eeatWeights ? { eeatWeights: input.eeatWeights } : {}),
  })
  const defaults = buildDraftSectionPromptDefaults({
    sectionId: input.sectionId,
    sectionType: input.sectionType,
    previousSectionSummary: input.previousSectionSummary,
    globalContext: input.globalContext,
    defaultSystem,
    researchSlice: input.researchSlice,
  })
  const vars = {
    section_id: input.sectionId,
    section_type: input.sectionType,
    previous_section_block:
      input.previousSectionSummary && input.previousSectionSummary.trim() ?
        `\n\nprevious: ${input.previousSectionSummary.trim()}`
      : '',
    global_context: input.globalContext,
    research_slice_block:
      input.researchSlice && input.researchSlice.trim() ?
        `\n\nper-section research (truncated):\n${input.researchSlice.trim()}`
      : '',
  }
  const { system, user } = await resolveTenantPromptPair(
    payload,
    tenantId,
    DRAFT_SECTION_SYSTEM,
    DRAFT_SECTION_USER,
    defaults,
    vars,
  )
  const r = await openrouterChatWithMeta(input.model, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
  return { text: r.text, usage: r.usage, raw: r.raw }
}
