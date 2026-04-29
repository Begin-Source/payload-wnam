import { describe, expect, it } from 'vitest'

import { applyAuditorVetoTable } from '@/utilities/eeatScoring'

describe('applyAuditorVetoTable', () => {
  it('no vetoes keeps floor score', () => {
    const r = applyAuditorVetoTable({ rawOverallScore: 78, vetoCount: 0 })
    expect(r.blocked).toBe(false)
    expect(r.finalOverallScore).toBe(78)
  })
  it('one veto above 60 caps at 60', () => {
    const r = applyAuditorVetoTable({ rawOverallScore: 72, vetoCount: 1 })
    expect(r.finalOverallScore).toBe(60)
  })
  it('two+ vetoes blocks', () => {
    const r = applyAuditorVetoTable({ rawOverallScore: 80, vetoCount: 2 })
    expect(r.blocked).toBe(true)
    expect(r.finalOverallScore).toBe(0)
  })
})
