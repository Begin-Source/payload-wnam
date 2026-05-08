import { describe, expect, it } from 'vitest'

import { parseTrendPoints, seasonalScore } from '@/utilities/seasonalScore'

describe('seasonalScore', () => {
  it('parseTrendPoints reads DataForSEO monthly shape', () => {
    const pts = parseTrendPoints([
      { year: 2025, month: 1, search_volume: 100 },
      { year: 2025, month: 2, search_volume: 200 },
    ])
    expect(pts).toHaveLength(2)
    expect(pts[0]).toMatchObject({ year: 2025, month: 1, search_volume: 100 })
  })

  it('returns null for insufficient series', () => {
    expect(seasonalScore([{ year: 2025, month: 1, search_volume: 50 }], new Date('2025-03-15'))).toBeNull()
  })

  it('returns high score when recent months near peak (holiday spike)', () => {
    const trend = [
      { year: 2024, month: 6, search_volume: 900 },
      { year: 2024, month: 7, search_volume: 950 },
      { year: 2024, month: 8, search_volume: 1000 },
      { year: 2024, month: 11, search_volume: 5000 },
      { year: 2024, month: 12, search_volume: 4800 },
    ]
    const s = seasonalScore(trend, new Date('2024-12-15'))
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThanOrEqual(0.85)
  })

  it('returns lower score in off-peak month', () => {
    const trend = [
      { year: 2024, month: 6, search_volume: 800 },
      { year: 2024, month: 11, search_volume: 5000 },
      { year: 2024, month: 12, search_volume: 4800 },
    ]
    const s = seasonalScore(trend, new Date('2024-06-10'))
    expect(s).not.toBeNull()
    expect(s!).toBeLessThan(0.5)
  })
})
