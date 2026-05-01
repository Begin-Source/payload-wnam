/** Normalized organic line for LLM brief + `content-briefs.sources.serp`. */
export type SerpOrganicBriefLine = {
  rank: number
  title: string
  url: string
  domain: string
  description: string | null
}

export type SerpBriefContext = {
  organicTop10: SerpOrganicBriefLine[]
  /** Distinct non-organic item `type` values on the SERP (feature signals). */
  featureTypes: string[]
}

export function unwrapSerpTaskItems(root: unknown): unknown[] | null {
  if (root == null || typeof root !== 'object') return null
  const o = root as Record<string, unknown>
  if (typeof o.status_code === 'number' && o.status_code !== 20000) return null
  const tasks = o.tasks
  if (!Array.isArray(tasks) || tasks.length === 0) return null
  const t0 = tasks[0] as Record<string, unknown>
  if (typeof t0.status_code === 'number' && t0.status_code !== 20000) return null
  const result = t0.result
  if (!Array.isArray(result) || result.length === 0) return null
  const r0 = result[0] as Record<string, unknown>
  const items = r0.items
  return Array.isArray(items) ? items : null
}

function unwrapItems(root: unknown): unknown[] | null {
  return unwrapSerpTaskItems(root)
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * From DataForSEO `google/organic/live/advanced` JSON body → top 10 organic + feature types.
 * Returns null if envelope invalid or empty.
 */
export function extractSerpBriefContext(raw: unknown): SerpBriefContext | null {
  const items = unwrapItems(raw)
  if (!items?.length) return null

  const featureTypes = new Set<string>()
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const row = it as { type?: string }
    const typ = typeof row.type === 'string' ? row.type : ''
    if (!typ || typ.toLowerCase() === 'organic') continue
    featureTypes.add(typ)
  }

  const organic: SerpOrganicBriefLine[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const row = it as {
      type?: string
      rank_absolute?: number
      rank_group?: number
      title?: string
      url?: string
      domain?: string
      description?: string
    }
    if ((row.type || '').toLowerCase() !== 'organic') continue
    const url = typeof row.url === 'string' ? row.url : ''
    if (!url) continue
    const rank =
      typeof row.rank_absolute === 'number' && Number.isFinite(row.rank_absolute)
        ? row.rank_absolute
        : typeof row.rank_group === 'number' && Number.isFinite(row.rank_group)
          ? row.rank_group
          : organic.length + 1
    organic.push({
      rank,
      title: typeof row.title === 'string' ? row.title : '',
      url,
      domain: typeof row.domain === 'string' && row.domain.trim() ? row.domain : domainFromUrl(url),
      description: typeof row.description === 'string' ? row.description : null,
    })
    if (organic.length >= 10) break
  }

  organic.sort((a, b) => a.rank - b.rank)

  if (organic.length === 0) return null

  return {
    organicTop10: organic.slice(0, 10),
    featureTypes: Array.from(featureTypes).sort(),
  }
}
