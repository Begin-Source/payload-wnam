import type { Where } from 'payload'
import type { Payload } from 'payload'

import { sortKeywordDocsByOpportunity } from '@/utilities/briefBatchDefaults'
import { computeKeywordDecay, type DecayRankingRow } from '@/utilities/keywordDecayScore'
import { buildQuickWinWhere, mergeQuickWinFilter, quickWinDefaultLimit, type QuickWinFilter } from '@/utilities/quickWinFilter'
import { seasonalScore } from '@/utilities/seasonalScore'
import { RankingSource } from '@/utilities/seoMatrixPipeline'

export type KeywordBatchMode =
  | 'default'
  | 'quick_wins'
  | 'high_commission_affiliate'
  | 'comparison_decision'
  | 'geo_friendly'
  | 'pillar_sprint'
  | 'seasonal'
  | 'refresh_decay'

export type KeywordBatchRow = {
  id: number
  term: string
  opportunityScore?: number | null
  status: string
  articleId?: number
  decayReason?: string
  decayScore?: number
  seasonalScore?: number
}

export type KeywordBatchLoadResult = {
  rows: KeywordBatchRow[]
  jobType: 'brief_generate' | 'content_refresh'
  /** Passed to brief_generate input.quickWins */
  briefQuickWins: boolean
  usedKeywordFallback: boolean
  appliedFilter?: Record<string, unknown>
  limitQuickDefault?: number
}

const ALLOWED_MODES: KeywordBatchMode[] = [
  'default',
  'quick_wins',
  'high_commission_affiliate',
  'comparison_decision',
  'geo_friendly',
  'pillar_sprint',
  'seasonal',
  'refresh_decay',
]

export function parseKeywordBatchMode(raw: string | undefined): KeywordBatchMode {
  const m = typeof raw === 'string' ? raw.trim() : 'default'
  return (ALLOWED_MODES.includes(m as KeywordBatchMode) ? m : 'default') as KeywordBatchMode
}

async function loadDefaultKeywordCandidates(
  payload: Payload,
  siteId: number,
): Promise<{ rows: KeywordBatchRow[]; usedKeywordFallback: boolean }> {
  const baseWhere = (status: string): Where => ({
    and: [{ site: { equals: siteId } }, { status: { equals: status } }],
  })
  for (const st of ['active', 'draft'] as const) {
    const res = await payload.find({
      collection: 'keywords',
      where: baseWhere(st),
      limit: 500,
      depth: 0,
    })
    const raw = res.docs as unknown as KeywordBatchRow[]
    if (raw.length > 0) {
      return {
        rows: sortKeywordDocsByOpportunity(raw),
        usedKeywordFallback: st === 'draft',
      }
    }
  }
  return { rows: [], usedKeywordFallback: false }
}

async function loadQuickWinKeywordRows(
  payload: Payload,
  siteId: number,
  filter: QuickWinFilter,
): Promise<KeywordBatchRow[]> {
  const res = await payload.find({
    collection: 'keywords',
    where: buildQuickWinWhere(siteId, filter),
    limit: 500,
    depth: 0,
  })
  const raw = res.docs as unknown as KeywordBatchRow[]
  return sortKeywordDocsByOpportunity(raw)
}

const AFFILIATE_MONEY_INTENTS = ['commercial', 'transactional'] as const
const HIGH_COMMISSION_CATEGORY =
  /\b(appliance|appliances|automotive|baby|beauty|camera|cameras|car|cars|coffee|cookware|desk|dog|cat|electronics|exercise|fitness|furniture|garage|garden|gear|grill|headphone|headphones|home|kitchen|knife|knives|laptop|mattress|monitor|office|outdoor|patio|pet|power tool|power tools|printer|robot vacuum|security camera|sports|tool|tools|vacuum|watch)\b/i
const COMPARISON_DECISION =
  /\b(vs|versus|compare|comparison|alternative|alternatives|review|reviews|worth it|best .+ for|best .+ under|top .+ for|which .+ is best|should i buy)\b/i

type AffiliateKeywordDoc = KeywordBatchRow & {
  keywordDifficulty?: number | null
  volume?: number | null
  intent?: string | null
}

export function isHighCommissionAffiliateTerm(term: string): boolean {
  return HIGH_COMMISSION_CATEGORY.test(term)
}

export function isComparisonDecisionTerm(term: string): boolean {
  return COMPARISON_DECISION.test(term)
}

function opportunityValue(doc: AffiliateKeywordDoc): number {
  return typeof doc.opportunityScore === 'number' && Number.isFinite(doc.opportunityScore)
    ? doc.opportunityScore
    : 0
}

function loadAffiliateMoneyWhere(
  siteId: number,
  opts: {
    eligibleOnly: boolean
    minVolume: number
    maxKd: number
  },
): Where {
  const and: Where[] = [
    { site: { equals: siteId } },
    { status: { in: ['active', 'draft'] } },
    { intent: { in: [...AFFILIATE_MONEY_INTENTS] } },
    { volume: { greater_than_equal: opts.minVolume } },
    { keywordDifficulty: { less_than_equal: opts.maxKd } },
  ]
  if (opts.eligibleOnly) {
    and.push({ eligible: { equals: true } })
  }
  return { and }
}

async function loadHighCommissionAffiliateRows(
  payload: Payload,
  siteId: number,
): Promise<{ rows: KeywordBatchRow[]; applied: Record<string, unknown> }> {
  const res = await payload.find({
    collection: 'keywords',
    where: loadAffiliateMoneyWhere(siteId, { eligibleOnly: true, minVolume: 150, maxKd: 45 }),
    limit: 500,
    depth: 0,
  })
  const raw = (res.docs as unknown as AffiliateKeywordDoc[]).filter((k) =>
    isHighCommissionAffiliateTerm(k.term ?? ''),
  )
  raw.sort((a, b) => opportunityValue(b) - opportunityValue(a))
  return {
    rows: raw,
    applied: {
      eligibleOnly: true,
      intentWhitelist: [...AFFILIATE_MONEY_INTENTS],
      minVolume: 150,
      maxKd: 45,
      termPattern: 'high-commission Amazon affiliate categories',
    },
  }
}

async function loadComparisonDecisionRows(
  payload: Payload,
  siteId: number,
): Promise<{ rows: KeywordBatchRow[]; applied: Record<string, unknown> }> {
  const res = await payload.find({
    collection: 'keywords',
    where: loadAffiliateMoneyWhere(siteId, { eligibleOnly: false, minVolume: 50, maxKd: 55 }),
    limit: 500,
    depth: 0,
  })
  const raw = (res.docs as unknown as AffiliateKeywordDoc[]).filter((k) =>
    isComparisonDecisionTerm(k.term ?? ''),
  )
  raw.sort((a, b) => opportunityValue(b) - opportunityValue(a))
  return {
    rows: raw,
    applied: {
      eligibleOnly: false,
      intentWhitelist: [...AFFILIATE_MONEY_INTENTS],
      minVolume: 50,
      maxKd: 55,
      termPattern: 'vs / review / alternatives / worth-it decision modifiers',
    },
  }
}

const GEO_INTENTS = new Set(['informational', 'navigational', 'commercial', 'transactional'])

function mergeGeoIntentWhitelist(body: Record<string, unknown>): string[] {
  if (
    Array.isArray(body.geoIntentWhitelist) &&
    body.geoIntentWhitelist.every((x) => typeof x === 'string')
  ) {
    const cleaned = (body.geoIntentWhitelist as string[])
      .map((x) => x.trim().toLowerCase())
      .filter((x) => GEO_INTENTS.has(x))
    if (cleaned.length > 0) return cleaned
  }
  const fromFilter = body.filter as Partial<Record<string, unknown>> | undefined
  const arr =
    Array.isArray(fromFilter?.intentWhitelist) && fromFilter.intentWhitelist.every((x) => typeof x === 'string')
      ? (fromFilter.intentWhitelist as string[])
      : ['informational', 'commercial']

  const cleaned = arr.map((x) => x.trim().toLowerCase()).filter((x) => GEO_INTENTS.has(x))
  return cleaned.length > 0 ? cleaned : ['informational', 'commercial']
}

const QUESTIONISH = /\?|^\s*(what|who|when|where|why|how|which|is|are|can|does|should)\b/i

async function loadGeoFriendlyRows(
  payload: Payload,
  siteId: number,
  body: Record<string, unknown>,
): Promise<{ rows: KeywordBatchRow[]; applied: Record<string, unknown> }> {
  const intents = mergeGeoIntentWhitelist(body)
  const questionOnly = body.geoQuestionOnly === true
  const where: Where = {
    and: [
      { site: { equals: siteId } },
      { status: { in: ['active', 'draft'] } },
      { geoFriendly: { equals: true } },
      { intent: { in: intents } },
    ],
  }
  const res = await payload.find({
    collection: 'keywords',
    where,
    limit: 500,
    depth: 0,
  })
  let raw = res.docs as unknown as Array<KeywordBatchRow & { term: string }>
  if (questionOnly) {
    raw = raw.filter((k) => QUESTIONISH.test(k.term ?? ''))
  }
  const sorted = sortKeywordDocsByOpportunity(raw)
  return {
    rows: sorted,
    applied: { intentWhitelist: intents, geoQuestionOnly: questionOnly },
  }
}

async function loadPillarSprintRows(
  payload: Payload,
  siteId: number,
  pillarId: number,
): Promise<KeywordBatchRow[]> {
  const where: Where = {
    and: [
      { site: { equals: siteId } },
      {
        or: [{ id: { equals: pillarId } }, { pillar: { equals: pillarId } }],
      },
      { status: { in: ['active', 'draft'] } },
    ],
  }
  const res = await payload.find({
    collection: 'keywords',
    where,
    limit: 500,
    depth: 0,
  })
  const raw = res.docs as unknown as KeywordBatchRow[]
  const pillar = raw.find((k) => k.id === pillarId)
  const spokes = raw.filter((k) => k.id !== pillarId)
  const sortedSpokes = sortKeywordDocsByOpportunity(spokes)
  if (pillar) {
    return [pillar, ...sortedSpokes]
  }
  return sortedSpokes
}

async function loadSeasonalRows(
  payload: Payload,
  siteId: number,
  minScore: number,
): Promise<{ rows: KeywordBatchRow[]; applied: Record<string, unknown> }> {
  const res = await payload.find({
    collection: 'keywords',
    where: {
      and: [{ site: { equals: siteId } }, { status: { in: ['active', 'draft'] } }],
    },
    limit: 500,
    depth: 0,
  })
  const now = new Date()
  type Doc = KeywordBatchRow & { trend?: unknown }
  const scored: Array<{ doc: KeywordBatchRow; s: number; rank: number }> = []
  for (const doc of res.docs as unknown as Doc[]) {
    const s = seasonalScore(doc.trend ?? null, now)
    if (s == null || s < minScore) continue
    const opp = typeof doc.opportunityScore === 'number' && Number.isFinite(doc.opportunityScore) ? doc.opportunityScore : 0
    scored.push({ doc, s, rank: s * (opp + 1) })
  }
  scored.sort((a, b) => b.rank - a.rank)
  const rows = scored.map(({ doc, s }) => ({ ...doc, seasonalScore: s }))
  return { rows: scored, applied: { minSeasonalScore: minScore } }
}

function toDate(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

async function loadRefreshDecayRows(
  payload: Payload,
  siteId: number,
  threshold: number,
): Promise<{ rows: KeywordBatchRow[]; applied: Record<string, unknown> }> {
  const articlesRes = await payload.find({
    collection: 'articles',
    where: {
      and: [{ site: { equals: siteId } }, { status: { equals: 'published' } }],
    },
    limit: 500,
    depth: 0,
  })

  const now = Date.now()
  const recentStart = new Date(now - 28 * 86400000)
  const priorEnd = recentStart
  const priorStart = new Date(now - 56 * 86400000)

  const out: KeywordBatchRow[] = []

  for (const art of articlesRes.docs as unknown as Array<
    Record<string, unknown> & { id: number; slug?: string; title?: string }
  >) {
    const pk = art.primaryKeyword
    const keywordId =
      typeof pk === 'number'
        ? pk
        : pk != null && typeof pk === 'object' && 'id' in pk
          ? Number((pk as { id: number }).id)
          : NaN
    if (!Number.isFinite(keywordId)) continue

    const kwRes = await payload.findByID({
      collection: 'keywords',
      id: keywordId,
      depth: 0,
    })
    if (!kwRes) continue
    const kw = kwRes as unknown as Record<string, unknown> & { id: number; term: string; lastRefreshedAt?: string }

    const rankRes = await payload.find({
      collection: 'rankings',
      where: {
        and: [
          { site: { equals: siteId } },
          { keyword: { equals: keywordId } },
          { rankingSource: { equals: RankingSource.serpLive } },
          { capturedAt: { greater_than_equal: priorStart.toISOString() } },
        ],
      },
      limit: 200,
      depth: 0,
      sort: '-capturedAt',
    })

    const allRows = rankRes.docs as unknown as Array<{
      serpPosition?: number | null
      capturedAt: string
    }>

    const recent: DecayRankingRow[] = []
    const prior: DecayRankingRow[] = []
    for (const r of allRows) {
      const cap = toDate(r.capturedAt)
      if (!cap) continue
      const row: DecayRankingRow = { serpPosition: r.serpPosition ?? null, capturedAt: cap }
      if (cap >= recentStart) recent.push(row)
      else if (cap < priorEnd && cap >= priorStart) prior.push(row)
    }

    const decay = computeKeywordDecay({
      keywordId,
      articleId: art.id,
      rankingsRecent: recent,
      rankingsPrior: prior,
      articlePublishedAt: toDate(art.publishedAt),
      articleLastRefreshedAt: toDate(art.updatedAt),
      keywordLastRefreshedAt: toDate(kw.lastRefreshedAt),
    })

    if (decay.score < threshold) continue

    out.push({
      id: keywordId,
      term: String(kw.term ?? art.title ?? art.slug ?? `kw-${keywordId}`),
      status: 'active',
      articleId: art.id,
      decayReason: decay.reason,
      decayScore: decay.score,
      opportunityScore: decay.score * 1000,
    })
  }

  out.sort((a, b) => (b.decayScore ?? 0) - (a.decayScore ?? 0))
  return { rows: out, applied: { decayThreshold: threshold } }
}

/**
 * Loads ordered keyword (or refresh) rows for batch-enqueue; does not run SERP clustering (quick_wins only).
 */
export async function loadKeywordBatchCandidates(
  payload: Payload,
  siteId: number,
  mode: KeywordBatchMode,
  body: Record<string, unknown>,
  defaultLimit: number,
): Promise<KeywordBatchLoadResult> {
  if (mode === 'quick_wins') {
    const filterMerged = mergeQuickWinFilter(body.filter as Partial<Record<string, unknown>> | undefined)
    const rows = await loadQuickWinKeywordRows(payload, siteId, filterMerged)
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: true,
      usedKeywordFallback: false,
      appliedFilter: { ...filterMerged, intentWhitelist: [...filterMerged.intentWhitelist] },
      limitQuickDefault: quickWinDefaultLimit(filterMerged, defaultLimit),
    }
  }

  if (mode === 'default') {
    const { rows, usedKeywordFallback: ufb } = await loadDefaultKeywordCandidates(payload, siteId)
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: false,
      usedKeywordFallback: ufb,
    }
  }

  if (mode === 'high_commission_affiliate') {
    const { rows, applied } = await loadHighCommissionAffiliateRows(payload, siteId)
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: false,
      usedKeywordFallback: false,
      appliedFilter: applied,
    }
  }

  if (mode === 'comparison_decision') {
    const { rows, applied } = await loadComparisonDecisionRows(payload, siteId)
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: false,
      usedKeywordFallback: false,
      appliedFilter: applied,
    }
  }

  if (mode === 'geo_friendly') {
    const { rows, applied } = await loadGeoFriendlyRows(payload, siteId, body)
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: false,
      usedKeywordFallback: false,
      appliedFilter: applied,
    }
  }

  if (mode === 'pillar_sprint') {
    const pid =
      typeof body.pillarId === 'number'
        ? body.pillarId
        : typeof body.pillarId === 'string' && /^\d+$/.test(body.pillarId.trim())
          ? Number(body.pillarId.trim())
          : NaN
    if (!Number.isFinite(pid)) {
      return {
        rows: [],
        jobType: 'brief_generate',
        briefQuickWins: false,
        usedKeywordFallback: false,
        appliedFilter: { error: 'pillarId required' },
      }
    }
    const rows = await loadPillarSprintRows(payload, siteId, Math.floor(pid))
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: false,
      usedKeywordFallback: false,
      appliedFilter: { pillarId: Math.floor(pid) },
    }
  }

  if (mode === 'seasonal') {
    const raw =
      typeof body.minSeasonalScore === 'number'
        ? body.minSeasonalScore
        : typeof body.minSeasonalScore === 'string'
          ? Number(body.minSeasonalScore)
          : 0.7
    const minScore = Number.isFinite(raw) ? Math.min(0.95, Math.max(0.35, raw)) : 0.7
    const { rows, applied } = await loadSeasonalRows(payload, siteId, minScore)
    return {
      rows,
      jobType: 'brief_generate',
      briefQuickWins: false,
      usedKeywordFallback: false,
      appliedFilter: applied,
    }
  }

  if (mode === 'refresh_decay') {
    const raw =
      typeof body.decayThreshold === 'number'
        ? body.decayThreshold
        : typeof body.decayThreshold === 'string'
          ? Number(body.decayThreshold)
          : 0.5
    const threshold = Number.isFinite(raw) ? Math.min(0.95, Math.max(0.1, raw)) : 0.5
    const { rows, applied } = await loadRefreshDecayRows(payload, siteId, threshold)
    return {
      rows,
      jobType: 'content_refresh',
      briefQuickWins: false,
      usedKeywordFallback: false,
      appliedFilter: applied,
    }
  }

  const { rows, usedKeywordFallback: ufb } = await loadDefaultKeywordCandidates(payload, siteId)
  return {
    rows,
    jobType: 'brief_generate',
    briefQuickWins: false,
    usedKeywordFallback: ufb,
  }
}
