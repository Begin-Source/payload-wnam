import { describe, expect, it } from 'vitest'

import { classifyGeoFriendly } from '@/utilities/classifyGeoFriendly'

describe('classifyGeoFriendly', () => {
  it('flags informational how-to questions', () => {
    expect(classifyGeoFriendly('how to choose a yoga mat', 'informational')).toBe(true)
  })

  it('flags what is / definition style', () => {
    expect(classifyGeoFriendly('what is a puzzle mat', 'informational')).toBe(true)
  })

  it('flags comparison and vs', () => {
    expect(classifyGeoFriendly('best exercise mat vs yoga mat', 'commercial')).toBe(true)
  })

  it('flags question mark', () => {
    expect(classifyGeoFriendly('is eva foam safe?', null)).toBe(true)
  })

  it('flags list / guide phrases', () => {
    expect(classifyGeoFriendly('list of stretching mats for beginners', null)).toBe(true)
    expect(classifyGeoFriendly('beginners guide to pilates mat', null)).toBe(true)
  })

  it('rejects bare transactional head terms without GEO signals', () => {
    expect(classifyGeoFriendly('buy yoga mat amazon', 'transactional')).toBe(false)
  })

  it('down-weights buy/near me style when mixed', () => {
    expect(classifyGeoFriendly('cheap yoga mat price near me', 'transactional')).toBe(false)
  })

  it('returns false for empty term', () => {
    expect(classifyGeoFriendly('', 'informational')).toBe(false)
  })

  it('who/when/where style questions', () => {
    expect(classifyGeoFriendly('who makes the best judo mats', 'informational')).toBe(true)
  })

  it('commercial still scores with strong phrase', () => {
    expect(classifyGeoFriendly('top 10 foam rollers for recovery', 'commercial')).toBe(true)
  })
})
