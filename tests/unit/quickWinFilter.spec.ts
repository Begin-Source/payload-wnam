import { describe, expect, it } from 'vitest'

import {
  buildQuickWinWhere,
  DEFAULT_QUICK_WIN_FILTER,
  mergeQuickWinFilter,
  quickWinDefaultLimit,
} from '@/utilities/quickWinFilter'

describe('quickWinFilter', () => {
  it('mergeQuickWinFilter clamps and swaps inverted volumes', () => {
    const f = mergeQuickWinFilter({
      minVolume: 900,
      maxVolume: 200,
      maxKd: 999,
      maxPick: 0,
      intentWhitelist: ['commercial'],
    })
    expect(f.minVolume).toBeLessThanOrEqual(f.maxVolume)
    expect(f.maxKd).toBe(100)
    expect(f.maxPick).toBe(1)
    expect(f.intentWhitelist).toEqual(['commercial'])
  })

  it('buildQuickWinWhere matches site + filters', () => {
    const where = buildQuickWinWhere(42, DEFAULT_QUICK_WIN_FILTER)
    expect(where).toEqual({
      and: [
        { site: { equals: 42 } },
        { status: { in: ['active', 'draft'] } },
        {
          and: [
            { volume: { greater_than_equal: DEFAULT_QUICK_WIN_FILTER.minVolume } },
            { volume: { less_than_equal: DEFAULT_QUICK_WIN_FILTER.maxVolume } },
          ],
        },
        { keywordDifficulty: { less_than_equal: DEFAULT_QUICK_WIN_FILTER.maxKd } },
        { eligible: { equals: true } },
        { intent: { in: ['commercial', 'transactional'] } },
      ],
    })
  })

  it('quickWinDefaultLimit respects maxPick cap', () => {
    expect(quickWinDefaultLimit(DEFAULT_QUICK_WIN_FILTER, 100)).toBe(10)
    expect(
      quickWinDefaultLimit({ ...DEFAULT_QUICK_WIN_FILTER, intentWhitelist: ['commercial'], maxPick: 99 }, 5),
    ).toBe(5)
  })
})
