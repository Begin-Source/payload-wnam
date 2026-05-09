import { describe, expect, it } from 'vitest'

import { appendDraftSectionStructuralGuardrailUserBlock } from '@/services/writing/draftSectionStructuralGuardrail'

describe('appendDraftSectionStructuralGuardrailUserBlock', () => {
  it('tells non-faq sections to omit FAQ/Q&A', () => {
    const b = appendDraftSectionStructuralGuardrailUserBlock('custom')
    expect(b).toContain('non-FAQ')
    expect(b).toContain('Do not add a FAQ')
  })

  it('tells faq section to stay a single block', () => {
    const b = appendDraftSectionStructuralGuardrailUserBlock('faq')
    expect(b).toContain('single FAQ')
    expect(b).toContain('FAQ Block')
  })
})
