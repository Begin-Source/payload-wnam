import { rankDelta } from '@/utilities/articleLifecycleTriage'

export type DecayRankingRow = {
  serpPosition: number | null | undefined
  capturedAt: string | Date
}

export type DecayInput = {
  keywordId: number
  articleId: number | null
  rankingsRecent: DecayRankingRow[]
  rankingsPrior: DecayRankingRow[]
  articlePublishedAt: Date | null
  articleLastRefreshedAt: Date | null
  keywordLastRefreshedAt: Date | null
}

export type DecayResult = {
  score: number
  reason: string
  primarySignal: 'rank_drop' | 'age_only' | 'no_data'
}

function avgPosition(rows: DecayRankingRow[]): number | null {
  const nums = rows
    .map((r) => (typeof r.serpPosition === 'number' && Number.isFinite(r.serpPosition) ? r.serpPosition : null))
    .filter((x): x is number => x != null)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function monthsSince(d: Date | null): number | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const ms = Date.now() - d.getTime()
  return ms / (86400000 * 30.44)
}

/**
 * Rank decay + staleness for refresh queue prioritization (0..1).
 */
export function computeKeywordDecay(i: DecayInput): DecayResult {
  const recentAvg = avgPosition(i.rankingsRecent)
  const priorAvg = avgPosition(i.rankingsPrior)
  const delta = rankDelta(priorAvg, recentAvg)

  if (delta != null && delta >= 3) {
    const base = 0.6 + Math.min(0.35, (delta - 3) * 0.04)
    return {
      score: Math.min(1, base),
      reason: `位次平均约 ${priorAvg?.toFixed(1) ?? '?'} → ${recentAvg?.toFixed(1) ?? '?'}（变差 ${delta}）`,
      primarySignal: 'rank_drop',
    }
  }

  if (recentAvg != null && recentAvg >= 11 && recentAvg <= 20) {
    const pub = monthsSince(i.articlePublishedAt)
    if (pub != null && pub >= 6) {
      return {
        score: 0.5,
        reason: `排名第 ${recentAvg.toFixed(0)} 附近停滞 + 文龄约 ${pub.toFixed(0)} 月`,
        primarySignal: 'rank_drop',
      }
    }
  }

  const refreshAnchor =
    i.articleLastRefreshedAt ??
    i.keywordLastRefreshedAt ??
    i.articlePublishedAt
  const stale = monthsSince(refreshAnchor)
  if (stale != null && stale >= 12) {
    return {
      score: 0.28,
      reason: `超过约 ${stale.toFixed(0)} 月未刷新（无足够 rank 对比数据）`,
      primarySignal: 'age_only',
    }
  }
  if (stale != null && stale >= 6) {
    return {
      score: 0.22,
      reason: `约 ${stale.toFixed(0)} 月未刷新；建议先跑 rank_track 观察位次`,
      primarySignal: 'age_only',
    }
  }

  return {
    score: 0.1,
    reason: 'rank 样本不足且内容较新',
    primarySignal: 'no_data',
  }
}
