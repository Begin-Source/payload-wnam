import { describe, expect, it } from 'vitest'

import { isHardVetoCode, listContainsHardVeto } from '@/utilities/eeatScoring'

describe('hard veto helpers', () => {
  it('detects hard veto ids', () => {
    expect(isHardVetoCode('T04')).toBe(true)
    expect(isHardVetoCode('C01')).toBe(true)
    expect(isHardVetoCode('R10')).toBe(true)
    expect(isHardVetoCode('O01')).toBe(false)
  })

  it('listContainsHardVeto', () => {
    expect(listContainsHardVeto(['O01', 'T04'])).toBe(true)
    expect(listContainsHardVeto(['O01'])).toBe(false)
  })
})
