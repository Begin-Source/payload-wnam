import { describe, expect, it } from 'vitest'

import {
  defaultBatchLimitFromDailyCap,
  sortKeywordDocsByOpportunity,
} from '@/utilities/briefBatchDefaults'

describe('defaultBatchLimitFromDailyCap', () => {
  it('returns dailyPostCap * 7 capped at 100', () => {
    expect(defaultBatchLimitFromDailyCap(3)).toBe(21)
    expect(defaultBatchLimitFromDailyCap(20)).toBe(100)
  })

  it('defaults to 3 when null or invalid', () => {
    expect(defaultBatchLimitFromDailyCap(null)).toBe(21)
    expect(defaultBatchLimitFromDailyCap(0)).toBe(21)
  })
})

describe('sortKeywordDocsByOpportunity', () => {
  it('sorts by opportunityScore descending with nulls last', () => {
    const sorted = sortKeywordDocsByOpportunity([
      { id: 1, opportunityScore: null as number | null },
      { id: 2, opportunityScore: 10 },
      { id: 3, opportunityScore: 50 },
    ])
    expect(sorted.map((x) => x.id)).toEqual([3, 2, 1])
  })
})
