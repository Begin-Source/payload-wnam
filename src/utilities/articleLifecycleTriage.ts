/**
 * Threshold-only lifecycle decisions (no LLM). Maps rank deltas → stage + workflow job specs.
 * GSC metrics stay as article fields until Search Console API is wired (placeholders ok).
 */

export type TrackedLifecycleStage =
  | 'probation'
  | 'winner'
  | 'borderline'
  | 'loser'
  | 'stable_watch'
  | 'repaired'
  | 'dying'

export type TriageEnqueueJob = {
  jobType:
    | 'content_audit'
    | 'content_refresh'
    | 'content_merge'
    | 'content_archive'
    | 'internal_link_reinforce'
    | 'meta_ab_optimize'
  input?: Record<string, unknown>
}

export type TriagePlanResult = {
  /** When null, keep existing stage */
  nextStage: TrackedLifecycleStage | null
  nextBestPosition: number | null
  nextCurrentPosition: number | null
  nextActionAt: Date | null
  jobs: TriageEnqueueJob[]
  historyEntry: Record<string, unknown>
  /** Append `historyEntry` to articles.optimizationHistory */
  persistHistory: boolean
}

const FIRST_PAGE = 10
const DYING_THRESHOLD = 30

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86400000)
}

/** Positive delta = worse (higher position number). */
export function rankDelta(prev: number | null, next: number | null): number | null {
  if (prev == null || next == null) return null
  return next - prev
}

/**
 * @param currentStage — only probation | winner | borderline | loser | stable_watch | repaired | dying
 * @param prevPosition — last known SERP position (articles.currentPosition or prior snapshot)
 * @param newPosition — latest rankings.serpPosition
 * @param bestPosition — articles.bestPosition (best = min)
 * @param stableDays — days since position last changed meaningfully (from two ranking rows or placeholder)
 * @param hasMergeTarget — another published article on pillar keyword with strong rank (caller-resolved)
 */
export function planArticleTriage(input: {
  currentStage: TrackedLifecycleStage | 'n_a' | 'merged' | 'archived'
  prevPosition: number | null
  newPosition: number | null
  bestPosition: number | null
  stableDays: number | null
  hasMergeTarget: boolean
  /** From latest ranking row */
  isAiOverviewHit: boolean
  /** Article fields; GSC API placeholder until wired */
  clicks30d: number | null
  impressions30d: number | null
}): TriagePlanResult {
  const {
    currentStage,
    prevPosition,
    newPosition,
    bestPosition,
    stableDays,
    hasMergeTarget,
    isAiOverviewHit,
    clicks30d,
    impressions30d,
  } = input

  const jobs: TriageEnqueueJob[] = []
  let nextStage: TrackedLifecycleStage | null = null
  let nextActionAt: Date | null = null
  const delta = rankDelta(prevPosition, newPosition)

  const nextCurrent = newPosition
  let nextBest: number | null = null
  if (newPosition != null) {
    nextBest =
      bestPosition == null ? newPosition : Math.min(bestPosition, newPosition)
  }

  if (currentStage === 'merged' || currentStage === 'archived' || currentStage === 'n_a') {
    return {
      nextStage: null,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt: null,
      jobs: [],
      historyEntry: { skipped: true, reason: 'terminal_or_untracked_stage', currentStage },
      persistHistory: false,
    }
  }

  if (newPosition == null) {
    return {
      nextStage: null,
      nextBestPosition: bestPosition,
      nextCurrentPosition: prevPosition,
      nextActionAt: null,
      jobs: [],
      historyEntry: {
        skipped: true,
        reason: 'no_rank_snapshot',
        note: 'Wire rank_track → rankings; until then triage skips rank rules.',
      },
      persistHistory: false,
    }
  }

  const historyBase: Record<string, unknown> = {
    at: new Date().toISOString(),
    fromStage: currentStage,
    prevPosition,
    newPosition,
    delta,
  }

  if (newPosition > DYING_THRESHOLD) {
    nextStage = 'dying'
    if (hasMergeTarget) {
      jobs.push({
        jobType: 'content_merge',
        input: { reason: 'triage_rank_below_threshold', mergeHint: 'pillar_strong_article' },
      })
    } else {
      jobs.push({
        jobType: 'content_archive',
        input: { reason: 'triage_rank_below_threshold', noMergeTarget: true },
      })
    }
    return {
      nextStage,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt: daysFromNow(1),
      jobs,
      historyEntry: { ...historyBase, toStage: nextStage, jobs: jobs.map((j) => j.jobType) },
      persistHistory: true,
    }
  }

  if (newPosition > FIRST_PAGE) {
    nextStage = 'borderline'
    jobs.push({
      jobType: 'content_audit',
      input: { reason: 'off_first_page', serpPosition: newPosition },
    })
    nextActionAt = daysFromNow(1)
    return {
      nextStage,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt,
      jobs,
      historyEntry: { ...historyBase, toStage: nextStage, jobs: jobs.map((j) => j.jobType) },
      persistHistory: true,
    }
  }

  if (delta != null && delta >= 5 && delta < 10) {
    jobs.push(
      {
        jobType: 'content_audit',
        input: { reason: 'rank_drop_5_10', delta },
      },
      {
        jobType: 'content_refresh',
        input: { reason: 'rank_drop_5_10', delta },
      },
    )
    nextActionAt = daysFromNow(1)
    return {
      nextStage: null,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt,
      jobs,
      historyEntry: { ...historyBase, jobs: jobs.map((j) => j.jobType), rankDropBand: '5_10' },
      persistHistory: true,
    }
  }

  if (delta != null && delta >= 3 && delta < 5) {
    jobs.push({
      jobType: 'content_audit',
      input: { reason: 'rank_drop_3_5', delta },
    })
    nextActionAt = daysFromNow(7)
    return {
      nextStage: null,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt,
      jobs,
      historyEntry: { ...historyBase, jobs: jobs.map((j) => j.jobType), rankDropBand: '3_5' },
      persistHistory: true,
    }
  }

  if (
    currentStage === 'winner' &&
    newPosition <= FIRST_PAGE &&
    (stableDays ?? 0) >= 7 &&
    (delta == null || Math.abs(delta) < 2)
  ) {
    jobs.push({
      jobType: 'internal_link_reinforce',
      input: { reason: 'winner_stable_7d', newPosition },
    })
    nextActionAt = daysFromNow(30)
    return {
      nextStage: null,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt,
      jobs,
      historyEntry: { ...historyBase, jobs: ['internal_link_reinforce'], winnerStable: true },
      persistHistory: true,
    }
  }

  if (
    currentStage === 'probation' &&
    newPosition <= FIRST_PAGE &&
    prevPosition != null &&
    delta != null &&
    delta <= 0
  ) {
    nextStage = 'winner'
    return {
      nextStage,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt: null,
      jobs: [],
      historyEntry: { ...historyBase, toStage: nextStage, promotion: 'probation_to_winner' },
      persistHistory: true,
    }
  }

  const lowCtrAi =
    isAiOverviewHit &&
    (clicks30d ?? 0) < 5 &&
    (impressions30d ?? 0) > 100 &&
    newPosition <= FIRST_PAGE

  if (lowCtrAi) {
    jobs.push({
      jobType: 'content_audit',
      input: {
        reason: 'geo_placeholder_ai_hit_low_clicks',
        note: 'When GSC API is connected, branch to geo-content-optimizer job.',
        isAiOverviewHit,
        clicks30d,
        impressions30d,
      },
    })
    return {
      nextStage: null,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt: daysFromNow(14),
      jobs,
      historyEntry: { ...historyBase, jobs: jobs.map((j) => j.jobType), geoQueue: 'placeholder' },
      persistHistory: true,
    }
  }

  /** 钉子 5 占位：位次 3–10 且 CTR 低于经验阈值 → meta A/B（仅在其他规则未命中时触发） */
  const ctr =
    impressions30d && impressions30d > 200 && clicks30d != null ? clicks30d / impressions30d : null
  if (newPosition >= 3 && newPosition <= 10 && ctr != null && ctr < 0.015) {
    jobs.push({
      jobType: 'meta_ab_optimize',
      input: {
        reason: 'low_ctr_band_placeholder',
        ctr,
        serpPosition: newPosition,
        note: 'Wire GSC industry CTR; OpenRouter meta-tags-optimizer fills metaVariants.',
      },
    })
    return {
      nextStage: null,
      nextBestPosition: nextBest,
      nextCurrentPosition: nextCurrent,
      nextActionAt: daysFromNow(14),
      jobs,
      historyEntry: { ...historyBase, jobs: jobs.map((j) => j.jobType), metaAb: true },
      persistHistory: true,
    }
  }

  return {
    nextStage: null,
    nextBestPosition: nextBest,
    nextCurrentPosition: nextCurrent,
    nextActionAt: null,
    jobs: [],
    historyEntry: { ...historyBase, noop: true, delta },
    persistHistory: false,
  }
}
