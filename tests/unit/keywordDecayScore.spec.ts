import { describe, expect, it } from 'vitest'

import { computeKeywordDecay } from '@/utilities/keywordDecayScore'

describe('computeKeywordDecay', () => {
  it('rank_drop when average position worsens by 3+', () => {
    const r = computeKeywordDecay({
      keywordId: 1,
      articleId: 10,
      rankingsRecent: [{ serpPosition: 12, capturedAt: new Date('2025-02-01') }],
      rankingsPrior: [{ serpPosition: 5, capturedAt: new Date('2025-01-01') }],
      articlePublishedAt: new Date('2024-01-01'),
      articleLastRefreshedAt: null,
      keywordLastRefreshedAt: null,
    })
    expect(r.primarySignal).toBe('rank_drop')
    expect(r.score).toBeGreaterThanOrEqual(0.6)
    expect(r.reason).toContain('变差')
  })

  it('age_only when no rank data but stale', () => {
    const r = computeKeywordDecay({
      keywordId: 1,
      articleId: 10,
      rankingsRecent: [],
      rankingsPrior: [],
      articlePublishedAt: new Date('2020-01-01'),
      articleLastRefreshedAt: null,
      keywordLastRefreshedAt: new Date('2020-06-01'),
    })
    expect(r.primarySignal).toBe('age_only')
    expect(r.score).toBeLessThanOrEqual(0.3)
  })

  it('no_data for fresh content without ranks', () => {
    const r = computeKeywordDecay({
      keywordId: 1,
      articleId: 10,
      rankingsRecent: [],
      rankingsPrior: [],
      articlePublishedAt: new Date(),
      articleLastRefreshedAt: null,
      keywordLastRefreshedAt: null,
    })
    expect(r.primarySignal).toBe('no_data')
    expect(r.score).toBeLessThanOrEqual(0.15)
  })

  it('stagnant page 2 with old article', () => {
    const r = computeKeywordDecay({
      keywordId: 1,
      articleId: 10,
      rankingsRecent: [{ serpPosition: 15, capturedAt: new Date() }],
      rankingsPrior: [{ serpPosition: 14, capturedAt: new Date('2024-01-01') }],
      articlePublishedAt: new Date('2022-01-01'),
      articleLastRefreshedAt: null,
      keywordLastRefreshedAt: null,
    })
    expect(r.score).toBeGreaterThanOrEqual(0.45)
  })
})
