/**
 * Best-effort parse of DataForSEO SERP "google/organic/live" style JSON for rank + AI Overview hit.
 */
export function parseOrganicPositionAndAiOverview(
  raw: unknown,
  matchHostname: string,
): { position: number | null; isAiOverviewHit: boolean } {
  let isAiOverviewHit = false
  const needle = matchHostname.toLowerCase().replace(/^www\./, '').replace(/\/$/, '')

  const walk = (node: unknown): void => {
    if (node == null) return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    if (typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const t = typeof o.type === 'string' ? o.type.toLowerCase() : ''
    if (t.includes('ai') && t.includes('overview')) isAiOverviewHit = true
    for (const v of Object.values(o)) walk(v)
  }
  walk(raw)

  const tryItems = (items: unknown[]): number | null => {
    for (const it of items) {
      if (!it || typeof it !== 'object') continue
      const row = it as { type?: string; rank_absolute?: number; url?: string }
      const typ = (row.type || '').toLowerCase()
      if (typ && typ !== 'organic' && typ !== 'featured_snippet' && typ !== 'answer_box') continue
      const url = typeof row.url === 'string' ? row.url.toLowerCase() : ''
      if (!url) continue
      try {
        const host = new URL(url).hostname.replace(/^www\./, '')
        if (host.includes(needle) || needle.includes(host)) {
          return typeof row.rank_absolute === 'number' && Number.isFinite(row.rank_absolute)
            ? row.rank_absolute
            : null
        }
      } catch {
        if (url.includes(needle)) {
          return typeof row.rank_absolute === 'number' ? row.rank_absolute : null
        }
      }
    }
    return null
  }

  const deepFindItems = (node: unknown): number | null => {
    if (node == null) return null
    if (Array.isArray(node)) {
      for (const x of node) {
        const r = deepFindItems(x)
        if (r != null) return r
      }
      return null
    }
    if (typeof node !== 'object') return null
    const o = node as Record<string, unknown>
    if (Array.isArray(o.items)) {
      const r = tryItems(o.items)
      if (r != null) return r
    }
    for (const v of Object.values(o)) {
      const r = deepFindItems(v)
      if (r != null) return r
    }
    return null
  }

  const position = deepFindItems(raw)
  return { position, isAiOverviewHit }
}
