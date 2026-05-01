import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import {
  normalizeKeywordIntent,
  type KeywordIntent,
} from '@/utilities/keywordEligibility'

export type NormalizedKeywordRow = {
  term: string
  volume: number
  kd: number
  intent: KeywordIntent
  cpc: number | null
  trend: unknown | null
}

type DfsKeywordResult = {
  keyword?: string
  search_volume?: number
  keyword_difficulty?: number
  search_intent?: string
  cpc?: number
  monthly_searches?: unknown
}

type DfsTaskBlock = {
  results?: DfsKeywordResult[]
}

/**
 * Wraps DataForSEO `keywords_for_keywords/live` for one or more seed terms; merges and dedupes by term (case-folded).
 */
export async function fetchKeywordsForKeywordsLive(args: {
  seeds: string[]
  locationCode: number
  languageCode: string
  limitTotal: number
  signal?: AbortSignal
}): Promise<NormalizedKeywordRow[]> {
  const { seeds, locationCode, languageCode, limitTotal, signal } = args
  const cleanSeeds = seeds.map((s) => s.trim()).filter(Boolean)
  if (cleanSeeds.length === 0 || limitTotal <= 0) return []

  const perSeed = Math.max(16, Math.ceil(limitTotal / cleanSeeds.length))
  const byTerm = new Map<string, NormalizedKeywordRow>()

  for (const seed of cleanSeeds) {
    const dfs = await dataForSeoPost<DfsTaskBlock[]>(
      '/v3/keywords_data/google_ads/keywords_for_keywords/live',
      [{ language_code: languageCode, location_code: locationCode, keywords: [seed] }],
      { signal },
    )
    const first = Array.isArray(dfs) ? dfs[0] : undefined
    const list = Array.isArray(first?.results) ? first.results : []

    for (const r of list.slice(0, perSeed)) {
      const term = String(r.keyword ?? seed).trim()
      if (!term) continue
      const key = term.toLowerCase()
      if (byTerm.has(key)) continue

      const volume = Number(r.search_volume ?? 0)
      const kd = Number(r.keyword_difficulty ?? 0)
      const intent = normalizeKeywordIntent(r.search_intent)
      let cpc: number | null = null
      if (r.cpc != null) {
        const n = typeof r.cpc === 'number' ? r.cpc : Number(r.cpc)
        if (Number.isFinite(n)) cpc = n
      }

      byTerm.set(key, {
        term,
        volume,
        kd,
        intent,
        cpc,
        trend: r.monthly_searches ?? null,
      })
      if (byTerm.size >= limitTotal) break
    }
    if (byTerm.size >= limitTotal) break
  }

  return Array.from(byTerm.values()).slice(0, limitTotal)
}
