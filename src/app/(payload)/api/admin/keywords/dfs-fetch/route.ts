import configPromise from '@payload-config'
import type { Payload, Where } from 'payload'
import { getPayload } from 'payload'

import {
  AMZ_DEFAULT_LANGUAGE_CODE,
  AMZ_DEFAULT_LOCATION_CODE,
} from '@/services/integrations/dataforseo/amzDefaults'
import { fetchKeywordSuggestionsLive } from '@/services/integrations/dataforseo/keywords'
import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  evaluateKeywordEligibility,
  loadAmzEligibilityThresholds,
  opportunityForKeywordRow,
  type AmzKeywordEligibilityThresholds,
  type KeywordIntent,
} from '@/utilities/keywordEligibility'
import { findSiteQuotaForSite, incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
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

async function slugExistsForSite(
  payload: Payload,
  userArg: Config['user'] & { collection: 'users' },
  siteId: number,
  slug: string,
): Promise<boolean> {
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
  return r.docs.length > 0
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
    return Response.json(
      { error: '所选站点未关联租户，无法创建关键词' },
      { status: 400 },
    )
  }

  const ps = await payload.findGlobal({
    slug: 'pipeline-settings',
    depth: 0,
  })
  const settings = ps as { dataForSeoEnabled?: boolean | null }
  if (settings?.dataForSeoEnabled === false) {
    return Response.json({ error: 'DataForSEO disabled in PipelineSettings' }, { status: 400 })
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

  const thresholds = await loadAmzEligibilityThresholds(payload, overrides)

  const locationCode =
    body.locationCode != null && Number.isFinite(Number(body.locationCode))
      ? Math.floor(Number(body.locationCode))
      : AMZ_DEFAULT_LOCATION_CODE
  const languageCode =
    typeof body.languageCode === 'string' && body.languageCode.trim().length > 0
      ? body.languageCode.trim().toLowerCase()
      : AMZ_DEFAULT_LANGUAGE_CODE

  /** ~2 DFS credits per seed (same order of magnitude as `keyword_discover`). */
  const dfsUnits = 2 * seeds.length
  const quotaRow = await findSiteQuotaForSite(payload, siteId)
  if (quotaRow && quotaRow.monthlyDfsCreditBudget > 0) {
    const spent = quotaRow.usageYtd.dfs ?? 0
    if (spent + dfsUnits > quotaRow.monthlyDfsCreditBudget) {
      return Response.json(
        {
          error: `DataForSEO 月度点数不足（已用 ${spent} / ${quotaRow.monthlyDfsCreditBudget}，本操作约需 ${dfsUnits}）`,
        },
        { status: 402 },
      )
    }
  }

  let normalized: Awaited<ReturnType<typeof fetchKeywordSuggestionsLive>>
  try {
    normalized = await fetchKeywordSuggestionsLive({
      seeds,
      locationCode,
      languageCode,
      limitTotal: thresholds.pullLimit,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: `DataForSEO: ${msg}` }, { status: 502 })
  }

  const enriched = normalized.map((r) => {
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

  for (const row of enriched) {
    if (row.eligible) eligibleCount += 1
    const slug = slugify(row.term) || `kw-${Date.now()}-${persisted}-${skipped}`

    const exists = await slugExistsForSite(payload, userArg, siteId, slug)
    if (exists) {
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
      opportunityScore: row.opportunityScore,
      eligible: row.eligible,
      eligibilityReason: row.eligibilityReason,
      lastRefreshedAt: nowIso,
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

  await incrementSiteQuotaUsage(payload, siteId, { dfs: dfsUnits })

  return Response.json({
    ok: true,
    total: enriched.length,
    persisted,
    skipped,
    eligibleCount,
    dfsCredits: dfsUnits,
    location: { locationCode, languageCode },
    thresholds,
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
