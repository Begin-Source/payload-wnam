import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost, keywordDataLocationAndLanguage } from '@/services/integrations/dataforseo/client'
import { computeOpportunityScore } from '@/utilities/keywordOpportunity'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/keyword-discover'

function siteEquals(siteId: string): string | number {
  return /^\d+$/.test(siteId) ? Number(siteId) : siteId
}

function slugify(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/gi, '')
    .slice(0, 120)
}

function normalizeIntent(raw: string | undefined): 'informational' | 'navigational' | 'commercial' | 'transactional' {
  const s = (raw ?? 'informational').toLowerCase()
  if (s.includes('transaction')) return 'transactional'
  if (s.includes('commercial')) return 'commercial'
  if (s.includes('navigat')) return 'navigational'
  return 'informational'
}

type SeedRow = { term: string; volume: number; kd: number; intent: string }

const FALLBACK_SEEDS: SeedRow[] = [
  { term: 'best affiliate programs', volume: 2400, kd: 34, intent: 'commercial' },
  { term: 'amazon affiliate disclosure template', volume: 880, kd: 22, intent: 'informational' },
  { term: 'seo content brief example', volume: 1600, kd: 41, intent: 'transactional' },
]

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    siteId?: string | number
    seed?: string
    persist?: boolean
  }
  if (!body.siteId) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
  }
  const siteKey = siteEquals(String(body.siteId))
  const siteRelation = typeof siteKey === 'number' ? siteKey : /^\d+$/.test(String(siteKey)) ? Number(siteKey) : undefined
  const persist = Boolean(body.persist)
  const payload = await getPayload({ config: configPromise })

  let rows: SeedRow[] = [...FALLBACK_SEEDS]
  const loc = await keywordDataLocationAndLanguage('US')
  let usedDfs = false

  try {
    const dfs = await dataForSeoPost<
      {
        results?: {
          keyword?: string
          search_volume?: number
          keyword_difficulty?: number
          search_intent?: string
        }[]
      }[]
    >('/v3/keywords_data/google_ads/keywords_for_keywords/live', [
      {
        language_code: loc.language_code,
        location_code: loc.location_code,
        keywords: [body.seed || 'affiliate marketing'],
      },
    ])
    const first = Array.isArray(dfs) ? dfs[0] : undefined
    const list = first?.results
    if (Array.isArray(list) && list.length > 0) {
      rows = list.slice(0, 12).map((r) => ({
        term: String(r.keyword ?? body.seed ?? 'keyword'),
        volume: Number(r.search_volume ?? 0),
        kd: Number(r.keyword_difficulty ?? 1),
        intent: normalizeIntent(r.search_intent),
      }))
      usedDfs = true
    }
  } catch {
    // keep FALLBACK_SEEDS
  }

  if (usedDfs && siteRelation != null && Number.isFinite(siteRelation)) {
    try {
      await incrementSiteQuotaUsage(payload, siteRelation, { dfs: 2 })
    } catch {
      /* ignore */
    }
  }

  const scored = rows.map((r) => {
    const intent = normalizeIntent(r.intent)
    return {
      ...r,
      intent,
      opportunityScore: computeOpportunityScore({
        volume: r.volume,
        keywordDifficulty: r.kd,
        intent,
      }),
    }
  })

  const createdIds: (string | number)[] = []
  if (persist) {
    for (const r of scored) {
      const slug = slugify(r.term) || `kw-${Date.now()}`
      try {
        const doc = await payload.create({
          collection: 'keywords',
          data: {
            term: r.term,
            slug,
            ...(siteRelation != null && Number.isFinite(siteRelation) ? { site: siteRelation } : {}),
            status: 'active',
            volume: r.volume,
            keywordDifficulty: r.kd,
            intent: r.intent as 'informational' | 'navigational' | 'commercial' | 'transactional',
            opportunityScore: r.opportunityScore,
            lastRefreshedAt: new Date().toISOString(),
          },
        })
        createdIds.push(doc.id)
      } catch {
        // duplicate slug / validation — skip row
      }
    }
  }

  return Response.json({
    ok: true,
    location: loc,
    persist,
    rows: scored,
    persistedCount: createdIds.length,
    persistedIds: createdIds,
  })
}
