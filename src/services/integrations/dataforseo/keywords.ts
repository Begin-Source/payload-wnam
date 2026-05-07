import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { extractDataForSeoCostUsd } from '@/services/integrations/dataforseo/extractDataForSeoCostUsd'
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
  /** Labs request seed(s) that produced this row (union when the same term appears under multiple seeds). */
  sourceSeeds: string[]
}

type KeywordInfoPayload = {
  search_volume?: number
  cpc?: number | null
  monthly_searches?: unknown
} | null

type LabsKeywordBlob = {
  keyword?: string
  keyword_info?: KeywordInfoPayload
  keyword_properties?: { keyword_difficulty?: number | null } | null
  search_intent_info?: { main_intent?: string | null } | null
}

type LabsResultSlice = LabsKeywordBlob & {
  seed_keyword?: string
  seed_keyword_data?: LabsKeywordBlob | null
  items?: LabsKeywordBlob[] | null
}

type DfsLabsEnvelope = {
  status_code?: number
  status_message?: string
  tasks?: Array<{
    status_code?: number
    status_message?: string
    result?: LabsResultSlice[] | null
  } | null>
}

const LABS_PATH = '/v3/dataforseo_labs/google/keyword_suggestions/live'

function throwIfBadStatus(kind: string, code: unknown, message?: string): void {
  if (code !== 20000) {
    const msg = typeof message === 'string' && message.trim() ? message.trim() : 'Unknown error'
    throw new Error(`${kind}: ${code} — ${msg}`)
  }
}

function mapLabsKeywordBlob(
  row: LabsKeywordBlob,
  fallbackTerm?: string,
  sourceSeed?: string,
): NormalizedKeywordRow | null {
  const term = String(row.keyword ?? fallbackTerm ?? '').trim()
  if (!term) return null

  const ki = row.keyword_info
  const volume = Number(ki?.search_volume ?? 0)
  const kdRaw = row.keyword_properties?.keyword_difficulty
  const kd = kdRaw != null && Number.isFinite(Number(kdRaw)) ? Number(kdRaw) : 0
  const intent = normalizeKeywordIntent(row.search_intent_info?.main_intent)

  let cpc: number | null = null
  const cRaw = ki?.cpc
  if (cRaw != null && cRaw !== undefined) {
    const n = typeof cRaw === 'number' ? cRaw : Number(cRaw)
    if (Number.isFinite(n)) cpc = n
  }

  const seedTrim = typeof sourceSeed === 'string' ? sourceSeed.trim() : ''
  const sourceSeeds = seedTrim ? [seedTrim] : []

  return {
    term,
    volume,
    kd,
    intent,
    cpc,
    trend: ki?.monthly_searches ?? null,
    sourceSeeds,
  }
}

/**
 * Parses DataForSEO Labs `keyword_suggestions/live`: tasks[0].result[] may attach
 * `seed_keyword_data` + KD/intent at the slice level and/or an `items` list for suggestions.
 */
function collectNormalizedFromResult(
  result: LabsResultSlice[] | null | undefined,
  /** Seed passed to the Labs `keyword` field for this request (tags every returned row). */
  sourceSeed: string,
): NormalizedKeywordRow[] {
  const out: NormalizedKeywordRow[] = []
  const slices = Array.isArray(result) ? result : []

  for (const part of slices) {
    const seedFall = typeof part.seed_keyword === 'string' ? part.seed_keyword : undefined

    if (part.seed_keyword_data && typeof part.seed_keyword_data.keyword === 'string') {
      const merged: LabsKeywordBlob = {
        keyword: part.seed_keyword_data.keyword,
        keyword_info: part.seed_keyword_data.keyword_info ?? undefined,
        keyword_properties: part.keyword_properties ?? part.seed_keyword_data.keyword_properties,
        search_intent_info: part.search_intent_info ?? part.seed_keyword_data.search_intent_info,
      }
      const row = mapLabsKeywordBlob(merged, seedFall, sourceSeed)
      if (row) out.push(row)
    }

    const items = Array.isArray(part.items) ? part.items : []
    for (const item of items) {
      const row = mapLabsKeywordBlob(item, seedFall, sourceSeed)
      if (row) out.push(row)
    }
  }

  return out
}

/** Merge DFS Labs seed strings for keyword dedupe / persistence (exported for dfs-fetch). */
export function mergeUniqueSeeds(a: string[], b: string[]): string[] {
  const set = new Set<string>()
  for (const s of a) {
    const t = s.trim()
    if (t) set.add(t)
  }
  for (const s of b) {
    const t = s.trim()
    if (t) set.add(t)
  }
  return Array.from(set).sort((x, y) => x.localeCompare(y))
}

/**
 * DataForSEO Labs Keyword Suggestions (live): returns related keywords with search volume,
 * keyword difficulty, CPC, monthly trend, and main search intent — suitable for AMZ eligibility.
 */
export async function fetchKeywordSuggestionsLive(args: {
  seeds: string[]
  locationCode: number
  languageCode: string
  limitTotal: number
  signal?: AbortSignal
}): Promise<{ rows: NormalizedKeywordRow[]; totalCostUsd: number }> {
  const { seeds, locationCode, languageCode, limitTotal, signal } = args
  const cleanSeeds = seeds.map((s) => s.trim()).filter(Boolean)
  if (cleanSeeds.length === 0 || limitTotal <= 0) return { rows: [], totalCostUsd: 0 }

  const perSeedCap = Math.max(16, Math.ceil(limitTotal / cleanSeeds.length))
  const dfsLimit = Math.min(1000, perSeedCap)
  const byTerm = new Map<string, NormalizedKeywordRow>()
  let totalCostUsd = 0

  for (const seed of cleanSeeds) {
    const dfs = await dataForSeoPost<DfsLabsEnvelope>(
      LABS_PATH,
      [
        {
          keyword: seed,
          location_code: locationCode,
          language_code: languageCode,
          limit: dfsLimit,
          include_seed_keyword: true,
          include_serp_info: false,
        },
      ],
      { signal },
    )

    totalCostUsd += extractDataForSeoCostUsd(dfs)

    throwIfBadStatus('DataForSEO', dfs.status_code, dfs.status_message)

    const task = dfs.tasks?.[0]
    if (!task) {
      throw new Error('DataForSEO: no tasks in Labs response')
    }
    throwIfBadStatus(
      `DataForSEO task[0]`,
      task.status_code,
      task.status_message ?? undefined,
    )

    const rows = collectNormalizedFromResult(task.result ?? undefined, seed)

    for (const r of rows.slice(0, dfsLimit)) {
      const key = r.term.toLowerCase()
      const prev = byTerm.get(key)
      if (prev) {
        byTerm.set(key, {
          ...prev,
          sourceSeeds: mergeUniqueSeeds(prev.sourceSeeds, r.sourceSeeds),
        })
        continue
      }
      if (byTerm.size >= limitTotal) break
      byTerm.set(key, r)
    }
    if (byTerm.size >= limitTotal) break
  }

  return {
    rows: Array.from(byTerm.values()).slice(0, limitTotal),
    totalCostUsd: Math.round(totalCostUsd * 1e9) / 1e9,
  }
}
