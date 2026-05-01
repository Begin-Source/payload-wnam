import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS,
  evaluateKeywordEligibility,
  opportunityForKeywordRow,
  parseAmzKeywordEligibilityJson,
} from '@/utilities/keywordEligibility'

describe('parseAmzKeywordEligibilityJson', () => {
  it('fills defaults when input missing', () => {
    const t = parseAmzKeywordEligibilityJson(null)
    expect(t.pullLimit).toBe(DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS.pullLimit)
    expect(t.intentWhitelist).toEqual(['commercial', 'transactional'])
  })

  it('parses custom intent whitelist', () => {
    const t = parseAmzKeywordEligibilityJson({
      intentWhitelist: ['informational'],
      minVolume: 50,
      maxKd: 40,
      minOpportunityScore: 12,
      pullLimit: 80,
    })
    expect(t.intentWhitelist).toEqual(['informational'])
    expect(t.minVolume).toBe(50)
    expect(t.pullLimit).toBe(80)
  })

  it('fallback intent whitelist when invalid', () => {
    const t = parseAmzKeywordEligibilityJson({ intentWhitelist: ['invalid'] })
    expect(t.intentWhitelist).toEqual(DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS.intentWhitelist)
  })
})

describe('evaluateKeywordEligibility', () => {
  const t = DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS

  it('rejects informational when whitelist is commercial+transactional', () => {
    const r = evaluateKeywordEligibility(
      { intent: 'informational', volume: 900, keywordDifficulty: 20, opportunityScore: 100 },
      t,
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('not in whitelist')
  })

  it('accepts boundary: volume 200 exactly, kd 60 exactly', () => {
    const score = opportunityForKeywordRow({
      volume: 200,
      keywordDifficulty: 60,
      intent: 'commercial',
    })
    const r = evaluateKeywordEligibility(
      { intent: 'commercial', volume: 200, keywordDifficulty: 60, opportunityScore: score },
      { ...t, minOpportunityScore: Math.min(t.minOpportunityScore, score) },
    )
    expect(r.eligible).toBe(true)
  })

  it('rejects volume one below minVolume', () => {
    const r = evaluateKeywordEligibility(
      { intent: 'commercial', volume: 199, keywordDifficulty: 10, opportunityScore: 500 },
      { ...t, minOpportunityScore: 10 },
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('< minVolume')
  })

  it('rejects kd above maxKd', () => {
    const r = evaluateKeywordEligibility(
      { intent: 'transactional', volume: 1000, keywordDifficulty: 61, opportunityScore: 500 },
      t,
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('> maxKd')
  })

  it('rejects score below threshold', () => {
    const r = evaluateKeywordEligibility(
      { intent: 'commercial', volume: 900, keywordDifficulty: 30, opportunityScore: 5 },
      { ...t, minOpportunityScore: 30 },
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('opportunityScore')
  })
})
