import configPromise from '@payload-config'
import type { Payload, Where } from 'payload'
import { getPayload } from 'payload'

import {
  fetchKeywordSuggestionsLive,
  mergeUniqueSeeds,
  type DataForSeoLabsFilter,
} from '@/services/integrations/dataforseo/keywords'
import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { classifyGeoFriendly } from '@/utilities/classifyGeoFriendly'
import {
  evaluateKeywordEligibility,
  loadAmzEligibilityThresholdsFromMerged,
  opportunityForKeywordRow,
  type AmzKeywordEligibilityThresholds,
  type KeywordIntent,
} from '@/utilities/keywordEligibility'
import {
  findSiteQuotaForSite,
  incrementSiteQuotaUsage,
  LEGACY_DFS_UNIT_TO_USD,
} from '@/utilities/siteQuotaCheck'
import { resolveDfsLocationLanguageFromMerged } from '@/utilities/pipelineDfsLocale'
import { resolvePipelineConfigForSite } from '@/utilities/resolvePipelineConfig'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(tenant: number | { id: number } | null | undefined): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(scope: TenantScope, siteTenantId: number | null): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

function slugify(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/gi, '')
    .slice(0, 120)
}

const INTENT_ALLOWED = new Set<string>([
  'informational',
  'navigational',
  'commercial',
  'transactional',
])

type PersistFilter = {
  intentWhitelist?: KeywordIntent[]
  maxKdLessThan?: number
  minVolumeGreaterThan?: number
}

function parsePersistFilter(raw: unknown): PersistFilter | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const filter: PersistFilter = {}
  if (Array.isArray(obj.intentWhitelist) && obj.intentWhitelist.length > 0) {
    const intents = obj.intentWhitelist
      .map((x) => (typeof x === 'string' ? x.trim().toLowerCase() : ''))
      .filter((x) => INTENT_ALLOWED.has(x)) as KeywordIntent[]
    if (intents.length > 0) {
      filter.intentWhitelist = intents
    }
  }
  if (obj.minVolumeGreaterThan != null && Number.isFinite(Number(obj.minVolumeGreaterThan))) {
    filter.minVolumeGreaterThan = Number(obj.minVolumeGreaterThan)
  }
  if (obj.maxKdLessThan != null && Number.isFinite(Number(obj.maxKdLessThan))) {
    filter.maxKdLessThan = Number(obj.maxKdLessThan)
  }
  return Object.keys(filter).length > 0 ? filter : null
}

function matchesPersistFilter(
  row: { intent: KeywordIntent; kd: number; volume: number },
  filter: PersistFilter | null,
): boolean {
  if (!filter) return true
  if (
    filter.intentWhitelist &&
    filter.intentWhitelist.length > 0 &&
    !filter.intentWhitelist.includes(row.intent)
  ) {
    return false
  }
  if (
    filter.minVolumeGreaterThan != null &&
    Number.isFinite(filter.minVolumeGreaterThan) &&
    row.volume <= filter.minVolumeGreaterThan
  ) {
    return false
  }
  if (
    filter.maxKdLessThan != null &&
    Number.isFinite(filter.maxKdLessThan) &&
    row.kd >= filter.maxKdLessThan
  ) {
    return false
  }
  return true
}

function dataForSeoFiltersFromPersistFilter(
  filter: PersistFilter | null,
): DataForSeoLabsFilter[] | undefined {
  if (!filter) return undefined
  const filters: DataForSeoLabsFilter[] = []
  const addFilter = (next: DataForSeoLabsFilter) => {
    if (filters.length > 0) filters.push('and')
    filters.push(next)
  }

  if (filter.minVolumeGreaterThan != null && Number.isFinite(filter.minVolumeGreaterThan)) {
    addFilter(['keyword_info.search_volume', '>', filter.minVolumeGreaterThan])
  }
  if (filter.maxKdLessThan != null && Number.isFinite(filter.maxKdLessThan)) {
    addFilter(['keyword_properties.keyword_difficulty', '<', filter.maxKdLessThan])
  }

  return filters.length > 0 ? filters : undefined
}

async function findKeywordDocBySlugForSite(
  payload: Payload,
  userArg: Config['user'] & { collection: 'users' },
  siteId: number,
  slug: string,
): Promise<{ id: string | number; dataForSeoSeeds?: unknown } | null> {
  const base: Where = {
    and: [{ slug: { equals: slug } }, { site: { equals: siteId } }],
  }
  const r = await payload.find({
    collection: 'keywords',
    where: base,
    limit: 1,
    depth: 0,
    user: userArg,
    overrideAccess: false,
  })
  const doc = r.docs[0]
  return doc ? (doc as { id: string | number; dataForSeoSeeds?: unknown }) : null
}

function stringArrayFromJsonField(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId = Number(body.siteId)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
  }

  let seedsRaw: unknown[] = []
  if (Array.isArray(body.seeds)) {
    seedsRaw = body.seeds
  }
  const seeds = seedsRaw
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
  if (seeds.length === 0) {
    return Response.json({ error: 'seeds required (non-empty strings)' }, { status: 400 })
  }
  if (seeds.length > 5) {
    return Response.json({ error: 'at most 5 seeds' }, { status: 400 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(user)
  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }
  const siteTenantId = tenantIdFromRelation(site.tenant)
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (siteTenantId == null) {
    return Response.json({ error: '所选站点未关联租户，无法创建关键词' }, { status: 400 })
  }

  const rawPid = body.pipelineProfileId
  let explicitPipelineProfileId: number | null = null
  if (typeof rawPid === 'number' && Number.isFinite(rawPid)) {
    explicitPipelineProfileId = Math.floor(rawPid)
  } else if (typeof rawPid === 'string' && /^\d+$/.test(rawPid.trim())) {
    explicitPipelineProfileId = Number(rawPid.trim())
  }

  const resolved = await resolvePipelineConfigForSite(payload, siteId, explicitPipelineProfileId)
  if ('ok' in resolved) {
    return Response.json({ error: resolved.error }, { status: 400 })
  }
  if (!resolved.merged.dataForSeoEnabled) {
    return Response.json(
      { error: 'DataForSEO disabled for this site / pipeline profile' },
      { status: 400 },
    )
  }

  const overrides: Partial<AmzKeywordEligibilityThresholds> = {}
  if (Array.isArray(body.intentWhitelist) && body.intentWhitelist.length > 0) {
    const intents = body.intentWhitelist
      .map((x) => (typeof x === 'string' ? x.trim().toLowerCase() : ''))
      .filter((x) => INTENT_ALLOWED.has(x)) as KeywordIntent[]
    if (intents.length > 0) {
      overrides.intentWhitelist = intents
    }
  }
  if (body.minVolume != null && Number.isFinite(Number(body.minVolume))) {
    overrides.minVolume = Number(body.minVolume)
  }
  if (body.maxKd != null && Number.isFinite(Number(body.maxKd))) {
    overrides.maxKd = Number(body.maxKd)
  }
  if (body.minOpportunityScore != null && Number.isFinite(Number(body.minOpportunityScore))) {
    overrides.minOpportunityScore = Number(body.minOpportunityScore)
  }
  if (body.pullLimit != null && Number.isFinite(Number(body.pullLimit))) {
    overrides.pullLimit = Number(body.pullLimit)
  }

  const thresholds = loadAmzEligibilityThresholdsFromMerged(resolved.merged, overrides)

  const fromMerged = resolveDfsLocationLanguageFromMerged(resolved.merged)
  const locationCode =
    body.locationCode != null && Number.isFinite(Number(body.locationCode))
      ? Math.floor(Number(body.locationCode))
      : fromMerged.location_code
  const languageCode =
    typeof body.languageCode === 'string' && body.languageCode.trim().length > 0
      ? body.languageCode.trim().toLowerCase()
      : fromMerged.language_code
  const persistFilter = parsePersistFilter(body.persistFilter)
  const dataForSeoFilters = dataForSeoFiltersFromPersistFilter(persistFilter)

  /** Preflight: legacy-equivalent USD ceiling (~2 abstract credits × LEGACY per seed). */
  const estimateUsd = seeds.length > 0 ? seeds.length * 2 * LEGACY_DFS_UNIT_TO_USD : 0
  const quotaRow = await findSiteQuotaForSite(payload, siteId)
  if (quotaRow && quotaRow.monthlyDfsCreditBudget > 0) {
    const spent = quotaRow.usageYtd.dataForSeoUsd ?? 0
    if (spent + estimateUsd > quotaRow.monthlyDfsCreditBudget) {
      return Response.json(
        {
          error: `DataForSEO 月度 USD 上限不足（已用约 $${spent.toFixed(4)} / $${quotaRow.monthlyDfsCreditBudget}，本操作预估约 $${estimateUsd.toFixed(4)}）`,
        },
        { status: 402 },
      )
    }
  }

  let normalizedRows: Awaited<ReturnType<typeof fetchKeywordSuggestionsLive>>['rows']
  let totalCostUsd = 0
  try {
    const res = await fetchKeywordSuggestionsLive({
      seeds,
      locationCode,
      languageCode,
      limitTotal: thresholds.pullLimit,
      filters: dataForSeoFilters,
    })
    normalizedRows = res.rows
    totalCostUsd = res.totalCostUsd
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: `DataForSEO: ${msg}` }, { status: 502 })
  }

  const enriched = normalizedRows.map((r) => {
    const opportunityScore = opportunityForKeywordRow({
      volume: r.volume,
      keywordDifficulty: r.kd,
      intent: r.intent,
    })
    const { eligible, reason } = evaluateKeywordEligibility(
      {
        intent: r.intent,
        volume: r.volume,
        keywordDifficulty: r.kd,
        opportunityScore,
      },
      thresholds,
    )
    return { ...r, opportunityScore, eligible, eligibilityReason: reason }
  })
  const persistableRows = enriched.filter((row) => matchesPersistFilter(row, persistFilter))
  const filteredOutByPersistCriteria = enriched.length - persistableRows.length

  let persisted = 0
  let skipped = 0
  let eligibleCount = 0

  type RowOut = {
    term: string
    volume: number
    kd: number
    intent: KeywordIntent
    cpc: number | null
    opportunityScore: number
    eligible: boolean
    eligibilityReason: string
    persistedId?: string | number
    skippedDuplicate?: boolean
    persistError?: string
  }
  const rowsOut: RowOut[] = []

  const nowIso = new Date().toISOString()

  for (const row of persistableRows) {
    if (row.eligible) eligibleCount += 1
    const slug = slugify(row.term) || `kw-${Date.now()}-${persisted}-${skipped}`

    const existingDoc = await findKeywordDocBySlugForSite(payload, userArg, siteId, slug)
    if (existingDoc) {
      const incoming = row.sourceSeeds ?? []
      if (incoming.length > 0) {
        const prev = stringArrayFromJsonField(existingDoc.dataForSeoSeeds)
        const merged = mergeUniqueSeeds(prev, incoming)
        try {
          await payload.update({
            collection: 'keywords',
            id: existingDoc.id,
            data: { dataForSeoSeeds: merged },
            user: userArg,
            overrideAccess: false,
          })
        } catch {
          /* optional merge */
        }
      }
      skipped += 1
      rowsOut.push({
        term: row.term,
        volume: row.volume,
        kd: row.kd,
        intent: row.intent,
        cpc: row.cpc,
        opportunityScore: row.opportunityScore,
        eligible: row.eligible,
        eligibilityReason: row.eligibilityReason,
        skippedDuplicate: true,
      })
      continue
    }

    const data = {
      term: row.term,
      slug,
      tenant: siteTenantId,
      site: siteId,
      status: 'draft' as const,
      volume: row.volume,
      keywordDifficulty: row.kd,
      ...(row.cpc != null ? { cpc: row.cpc } : {}),
      ...(row.trend != null ? { trend: row.trend } : {}),
      intent: row.intent,
      geoFriendly: classifyGeoFriendly(row.term, row.intent),
      opportunityScore: row.opportunityScore,
      eligible: row.eligible,
      eligibilityReason: row.eligibilityReason,
      lastRefreshedAt: nowIso,
      ...((row.sourceSeeds?.length ?? 0) > 0 ? { dataForSeoSeeds: row.sourceSeeds } : {}),
    }

    try {
      const doc = await payload.create({
        collection: 'keywords',
        data: data as never,
        user: userArg,
        overrideAccess: false,
      })
      persisted += 1
      rowsOut.push({
        term: row.term,
        volume: row.volume,
        kd: row.kd,
        intent: row.intent,
        cpc: row.cpc,
        opportunityScore: row.opportunityScore,
        eligible: row.eligible,
        eligibilityReason: row.eligibilityReason,
        persistedId: doc.id,
      })
    } catch (e) {
      skipped += 1
      rowsOut.push({
        term: row.term,
        volume: row.volume,
        kd: row.kd,
        intent: row.intent,
        cpc: row.cpc,
        opportunityScore: row.opportunityScore,
        eligible: row.eligible,
        eligibilityReason: row.eligibilityReason,
        persistError: e instanceof Error ? e.message : 'create failed',
      })
    }
  }

  await incrementSiteQuotaUsage(payload, siteId, { dataForSeoUsd: totalCostUsd })

  return Response.json({
    ok: true,
    total: enriched.length,
    persistable: persistableRows.length,
    filteredOutByPersistCriteria,
    persisted,
    skipped,
    eligibleCount,
    dataForSeoUsdCharged: totalCostUsd,
    location: { locationCode, languageCode },
    thresholds,
    ...(persistFilter ? { persistFilter } : {}),
    ...(dataForSeoFilters ? { dataForSeoFilters } : {}),
    seeds,
    rows: rowsOut.map((ro) => ({
      term: ro.term,
      volume: ro.volume,
      kd: ro.kd,
      intent: ro.intent,
      cpc: ro.cpc,
      opportunityScore: ro.opportunityScore,
      eligible: ro.eligible,
      eligibilityReason: ro.eligibilityReason,
      ...(ro.persistedId != null ? { persistedId: ro.persistedId } : {}),
      ...(ro.skippedDuplicate ? { skippedDuplicate: true } : {}),
      ...(ro.persistError != null ? { persistError: ro.persistError } : {}),
    })),
  })
}
