export type AnchorReport = {
  targetId: string
  totalInlinks: number
  exactPct: number
  genericPct: number
  overOptimized: boolean
  genericAnchorOveruse: boolean
}

const GENERIC_RE = /^(click here|read more|here|more|learn more|details)$/i

/**
 * Aggregate inlink anchor usage per target (`toId`). Rules align with plan patch H (thresholds).
 * @param edges — rows from `page-link-graph` with `location === 'body'` preferred; pass all if unknown.
 */
export function auditAnchorsForSite(
  _siteId: string,
  edges: { toId: string; anchorText?: string | null; anchorType?: string | null }[],
): AnchorReport[] {
  const byTarget = new Map<
    string,
    { texts: string[]; types: (string | null | undefined)[] }
  >()

  for (const e of edges) {
    if (!e.toId) continue
    const g = byTarget.get(e.toId) ?? { texts: [], types: [] }
    g.texts.push((e.anchorText ?? '').trim())
    g.types.push(e.anchorType)
    byTarget.set(e.toId, g)
  }

  const reports: AnchorReport[] = []
  for (const [targetId, { texts, types }] of byTarget) {
    const total = texts.length
    if (total === 0) continue

    let exact = 0
    let generic = 0
    for (let i = 0; i < texts.length; i++) {
      const t = types[i]
      if (t === 'exact') exact += 1
      else if (t === 'generic') generic += 1
      else if (GENERIC_RE.test(texts[i] ?? '')) generic += 1
    }

    const exactPct = (exact / total) * 100
    const genericPct = (generic / total) * 100
    const overOptimized = exactPct > 40
    const genericAnchorOveruse = genericPct > 15

    reports.push({
      targetId,
      totalInlinks: total,
      exactPct: Math.round(exactPct * 10) / 10,
      genericPct: Math.round(genericPct * 10) / 10,
      overOptimized,
      genericAnchorOveruse,
    })
  }

  return reports.sort((a, b) => b.totalInlinks - a.totalInlinks)
}
