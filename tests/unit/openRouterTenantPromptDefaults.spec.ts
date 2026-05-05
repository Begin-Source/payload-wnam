import { describe, expect, it } from 'vitest'

import { getSkillPrompt } from '@/services/prompts/skillPrompts'
import {
  buildDraftSectionPromptDefaults,
  buildSerpBriefPromptDefaults,
} from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { SERP_BRIEF_SYSTEM_ADDON } from '@/utilities/openRouterTenantPrompts/serpBriefConstants'

describe('openRouter tenant prompt defaults', () => {
  it('SERP brief system joins memory + addon like legacy route', () => {
    const memory_block = 'mem'
    const { system } = buildSerpBriefPromptDefaults({
      memory_block,
      serp_user_block: 'serp',
      tavily_slice: 'tav',
      term: 'kw',
    })
    expect(system).toBe(`${memory_block}\n\n${SERP_BRIEF_SYSTEM_ADDON}`)
  })

  it('draft section user matches legacy blank-previous layout', () => {
    const { user } = buildDraftSectionPromptDefaults({
      sectionId: 'a',
      sectionType: 'intro',
      globalContext: 'ctx',
      defaultSystem: getSkillPrompt('seo-content-writer', { contentType: 'intro' }),
    })
    expect(user).toBe('sectionId: a\n\nsectionType: intro\n\ncontext:\nctx')
  })

  it('draft section user includes previous line when set', () => {
    const { user } = buildDraftSectionPromptDefaults({
      sectionId: 'a',
      sectionType: 'intro',
      previousSectionSummary: 'prev',
      globalContext: 'ctx',
      defaultSystem: 'sys',
    })
    expect(user).toContain('previous: prev')
    expect(user).toContain('context:\nctx')
  })
})
