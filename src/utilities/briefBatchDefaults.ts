const WEEK_MULTIPLIER = 7
const MAX_BATCH = 100
const MIN_BATCH = 1

/**
 * Suggested max jobs per "批量排产" request: `dailyPostCap * 7`, clamped to [1, 100].
 */
export function defaultBatchLimitFromDailyCap(dailyPostCap: number | null | undefined): number {
  const cap = typeof dailyPostCap === 'number' && dailyPostCap > 0 ? dailyPostCap : 3
  return Math.min(Math.max(cap * WEEK_MULTIPLIER, MIN_BATCH), MAX_BATCH)
}

/**
 * `opportunityScore` descending; null/undefined last.
 */
export function sortKeywordDocsByOpportunity<T extends { opportunityScore?: number | null }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const va = a.opportunityScore
    const vb = b.opportunityScore
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return vb - va
  })
}

export { MAX_BATCH, MIN_BATCH, WEEK_MULTIPLIER }
