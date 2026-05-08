export type TrendPoint = {
  year?: number
  month?: number
  search_volume?: number
}

function monthLabel(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Parses DataForSEO `monthly_searches` / keywords.trend.
 */
export function parseTrendPoints(trend: unknown): TrendPoint[] {
  if (!Array.isArray(trend)) return []
  const out: TrendPoint[] = []
  for (const x of trend) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const year = typeof o.year === 'number' ? o.year : Number(o.year)
    const month = typeof o.month === 'number' ? o.month : Number(o.month)
    const svRaw = o.search_volume ?? o.volume
    const search_volume = typeof svRaw === 'number' ? svRaw : Number(svRaw)
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(search_volume)) continue
    out.push({ year, month, search_volume })
  }
  return out
}

/**
 * Ratio of recent 2-month average search volume vs max monthly in series. 0..1, or null if insufficient data.
 */
export function seasonalScore(trend: unknown, now: Date = new Date()): number | null {
  const pts = parseTrendPoints(trend)
  if (pts.length < 3) return null

  const byMonth = new Map<string, number>()
  let maxVol = 0
  for (const p of pts) {
    if (p.year == null || p.month == null || p.search_volume == null) continue
    const label = monthLabel(p.year, p.month)
    byMonth.set(label, Math.max(byMonth.get(label) ?? 0, p.search_volume))
    maxVol = Math.max(maxVol, p.search_volume)
  }
  if (maxVol <= 0) return null

  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const recent: number[] = []
  for (let i = 0; i < 2; i++) {
    let mi = m - i
    let yi = y
    while (mi < 1) {
      mi += 12
      yi -= 1
    }
    const vol = byMonth.get(monthLabel(yi, mi))
    if (vol != null) recent.push(vol)
  }
  if (recent.length === 0) return null
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  return Math.min(1, Math.max(0, recentAvg / maxVol))
}
