import type { Where } from 'payload'

/** Admin “精选 Quick-win → brief_generate” thresholds (long-tail bias). */
export type QuickWinFilter = {
  eligibleOnly: boolean
  intentWhitelist: readonly string[]
  minVolume: number
  maxVolume: number
  maxKd: number
  /** Max keywords to enqueue in one action (caps UI/API `limit`). */
  maxPick: number
}

export const DEFAULT_QUICK_WIN_FILTER: QuickWinFilter = {
  eligibleOnly: true,
  intentWhitelist: ['commercial', 'transactional'],
  minVolume: 200,
  maxVolume: 2000,
  maxKd: 30,
  maxPick: 10,
} as const

const ALLOWED_INTENTS = new Set(['informational', 'navigational', 'commercial', 'transactional'])

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/**
 * Merge request `filter` partial into defaults; sanitizes intents and numeric bounds.
 */
export function mergeQuickWinFilter(partial?: Partial<Record<string, unknown>>): QuickWinFilter {
  const base = DEFAULT_QUICK_WIN_FILTER
  if (!partial || typeof partial !== 'object') {
    return { ...base, intentWhitelist: [...base.intentWhitelist] }
  }
  let intents =
    Array.isArray(partial.intentWhitelist) && partial.intentWhitelist.every((x) => typeof x === 'string')
      ? (partial.intentWhitelist as string[])
          .map((x) => x.trim().toLowerCase())
          .filter((x) => ALLOWED_INTENTS.has(x))
      : [...base.intentWhitelist]
  if (intents.length === 0) intents = [...base.intentWhitelist]

  const eligibleOnly =
    typeof partial.eligibleOnly === 'boolean' ? partial.eligibleOnly : base.eligibleOnly

  let minVolume = clampInt(partial.minVolume, base.minVolume, 0, 1_000_000)
  let maxVolume = clampInt(partial.maxVolume, base.maxVolume, 0, 1_000_000)
  if (minVolume > maxVolume) {
    const t = minVolume
    minVolume = maxVolume
    maxVolume = t
  }

  return {
    eligibleOnly,
    intentWhitelist: intents,
    minVolume,
    maxVolume,
    maxKd: clampInt(partial.maxKd, base.maxKd, 0, 100),
    maxPick: clampInt(partial.maxPick, base.maxPick, 1, 100),
  }
}

/**
 * Payload `where` for keywords matching quick-win semantics for a given site.
 */
export function buildQuickWinWhere(siteId: number, filter: QuickWinFilter): Where {
  const parts: Where[] = [
    { site: { equals: siteId } },
    { status: { in: ['active', 'draft'] } },
    {
      and: [
        { volume: { greater_than_equal: filter.minVolume } },
        { volume: { less_than_equal: filter.maxVolume } },
      ],
    },
    { keywordDifficulty: { less_than_equal: filter.maxKd } },
  ]
  if (filter.eligibleOnly) {
    parts.push({ eligible: { equals: true } })
  }
  if (filter.intentWhitelist.length > 0) {
    parts.push({ intent: { in: [...filter.intentWhitelist] } })
  }
  return { and: parts }
}

/**
 * Default `limit` cap for quick-wins mode: respect daily batch habit and maxPick.
 */
export function quickWinDefaultLimit(
  mergedFilter: QuickWinFilter,
  defaultFromDailyCap: number,
): number {
  return Math.min(mergedFilter.maxPick, defaultFromDailyCap)
}
