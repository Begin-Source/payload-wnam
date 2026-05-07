/**
 * DataForSEO Labs `ranked_keywords/live` envelope → flat items for ingest.
 */

export type RankedKeywordLabsItem = {
  keyword?: string
  keyword_data?: unknown
  ranked_serp_element?: {
    serp_item?: {
      rank_group?: number
      rank_absolute?: number
      type?: string
    }
  }
}

export function extractRankedKeywordsItems(envelope: unknown): RankedKeywordLabsItem[] {
  const tasks = (envelope as { tasks?: unknown[] })?.tasks
  if (!Array.isArray(tasks) || tasks.length === 0) return []
  const task = tasks[0] as { result?: unknown[] }
  const resultArr = task?.result
  if (!Array.isArray(resultArr) || resultArr.length === 0) return []
  const first = resultArr[0] as { items?: unknown[] }
  const items = first?.items
  if (!Array.isArray(items)) return []
  return items.filter((x): x is RankedKeywordLabsItem => x != null && typeof x === 'object')
}

export function serpPositionFromRankedKeywordItem(item: RankedKeywordLabsItem): number | null {
  const serp = item.ranked_serp_element?.serp_item
  if (!serp) return null
  const rg = serp.rank_group
  const ra = serp.rank_absolute
  if (typeof rg === 'number' && Number.isFinite(rg)) return rg
  if (typeof ra === 'number' && Number.isFinite(ra)) return ra
  return null
}

export function keywordTermFromRankedKeywordItem(item: RankedKeywordLabsItem): string {
  const k = item.keyword
  return typeof k === 'string' ? k.trim() : ''
}
