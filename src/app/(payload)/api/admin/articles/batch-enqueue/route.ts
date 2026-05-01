import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import { defaultBatchLimitFromDailyCap, sortKeywordDocsByOpportunity } from '@/utilities/briefBatchDefaults'
import {
  buildQuickWinWhere,
  mergeQuickWinFilter,
  quickWinDefaultLimit,
  type QuickWinFilter,
} from '@/utilities/quickWinFilter'
import type { KeywordClusterOutputCluster } from '@/utilities/keywordClusterPipeline'
import { runKeywordClusterForSite } from '@/utilities/keywordClusterPipeline'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

type KeywordRow = {
  id: number
  term: string
  opportunityScore?: number | null
  status: string
}

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

async function fetchDailyPostCap(
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
): Promise<number | null> {
  const r = await payload.find({
    collection: 'site-quotas',
    where: { site: { equals: siteId } },
    limit: 1,
    depth: 0,
  })
  const row = r.docs[0] as { dailyPostCap?: number | null } | undefined
  return row?.dailyPostCap ?? null
}

/**
 * Picks `active` keywords for a site; if none, falls back to `draft`.
 */
async function loadKeywordCandidates(
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
): Promise<{ keywords: KeywordRow[]; usedFallback: boolean }> {
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
    const raw = res.docs as unknown as KeywordRow[]
    if (raw.length > 0) {
      return {
        keywords: sortKeywordDocsByOpportunity(raw),
        usedFallback: st === 'draft',
      }
    }
  }
  return { keywords: [], usedFallback: false }
}

async function loadQuickWinCandidates(
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
  filter: QuickWinFilter,
): Promise<KeywordRow[]> {
  const res = await payload.find({
    collection: 'keywords',
    where: buildQuickWinWhere(siteId, filter),
    limit: 500,
    depth: 0,
  })
  const raw = res.docs as unknown as KeywordRow[]
  return sortKeywordDocsByOpportunity(raw)
}

async function hasPendingBriefJobForKeyword(
  payload: Awaited<ReturnType<typeof getPayload>>,
  keywordId: number,
): Promise<boolean> {
  const c = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'brief_generate' } },
        { status: { in: ['pending', 'running'] } },
        { pipelineKeyword: { equals: keywordId } },
      ],
    },
  })
  return c.totalDocs > 0
}

export type BatchEnqueueResult = {
  ok: true
  mode: 'default' | 'quick_wins'
  dryRun?: boolean
  enqueued: number
  skipped: number
  usedKeywordFallback: boolean
  defaultLimit: number
  limit: number
  errorsSample: string[]
  pickedTerms?: string[]
  pickedIds?: number[]
  appliedFilter?: QuickWinFilter
  clusters?: KeywordClusterOutputCluster[]
  totalDfsCalls?: number
  clusterBeforeEnqueue?: boolean
  clusterMinOverlap?: number
}

/**
 * POST { siteId, limit?, mode?, dryRun?, filter?, clusterBeforeEnqueue?, clusterMinOverlap?, refreshCluster? }
 * Tenant-scoped; enqueues `brief_generate` for top keywords (default) or quick-win-filtered keywords.
 * Quick-win + `clusterBeforeEnqueue` (default): SERP overlap clustering, writes `keywords.pillar`, enqueues pillars only.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId =
    typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : 'default'
  const mode = modeRaw === 'quick_wins' ? ('quick_wins' as const) : ('default' as const)
  const dryRun = body.dryRun === true
  const filterMerged = mergeQuickWinFilter(body.filter as Partial<Record<string, unknown>> | undefined)

  const scope = getTenantScopeForStats(user)
  const site = await payload.findByID({ collection: 'sites', id: siteId, depth: 0 })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }
  const siteTenantId = tenantIdFromRelation(
    (site as { tenant?: number | { id: number } | null }).tenant,
  )
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dpc = await fetchDailyPostCap(payload, siteId)
  const defaultLimit = defaultBatchLimitFromDailyCap(dpc)

  let keywords: KeywordRow[]
  let usedFallback = false
  let appliedFilter: QuickWinFilter | undefined

  if (mode === 'quick_wins') {
    appliedFilter = filterMerged
    keywords = await loadQuickWinCandidates(payload, siteId, filterMerged)
    if (keywords.length === 0) {
      const r: BatchEnqueueResult = {
        ok: true,
        mode,
        ...(dryRun ? { dryRun: true } : {}),
        enqueued: 0,
        skipped: 0,
        usedKeywordFallback: false,
        defaultLimit,
        limit: Math.min(Math.max(1, quickWinDefaultLimit(filterMerged, defaultLimit)), 100),
        errorsSample: ['该站点没有符合 Quick-win 条件的关键词（eligible / KD / volume / intent）。'],
        pickedTerms: [],
        pickedIds: [],
        appliedFilter,
      }
      return Response.json(r)
    }
  } else {
    const loaded = await loadKeywordCandidates(payload, siteId)
    keywords = loaded.keywords
    usedFallback = loaded.usedFallback
  }

  const limitQuickDefault = quickWinDefaultLimit(filterMerged, defaultLimit)
  const limitRaw =
    typeof body.limit === 'number'
      ? body.limit
      : typeof body.limit === 'string'
        ? Number(body.limit)
        : Number.NaN
  const fallbackLimit = mode === 'quick_wins' ? limitQuickDefault : defaultLimit
  const parsedLimit =
    Number.isFinite(limitRaw) && typeof limitRaw === 'number' && limitRaw > 0
      ? Math.floor(limitRaw)
      : fallbackLimit

  const limit = Math.min(Math.max(1, parsedLimit), 100)

  const clusterBeforeEnqueue =
    mode === 'quick_wins' && body.clusterBeforeEnqueue !== false

  const clusterOverlapRaw =
    typeof body.clusterMinOverlap === 'number'
      ? body.clusterMinOverlap
      : typeof body.clusterMinOverlap === 'string'
        ? Number(body.clusterMinOverlap)
        : Number.NaN
  const clusterMinOverlap = Number.isFinite(clusterOverlapRaw)
    ? Math.min(6, Math.max(2, Math.floor(clusterOverlapRaw)))
    : 3

  let poolIds: Set<number> | null = null
  let pillarIdSet = new Set<number>()
  let clustersOut: KeywordClusterOutputCluster[] | undefined
  let totalDfsCalls: number | undefined

  if (keywords.length === 0) {
    const r: BatchEnqueueResult = {
      ok: true,
      mode,
      ...(dryRun ? { dryRun: true } : {}),
      enqueued: 0,
      skipped: 0,
      usedKeywordFallback: false,
      defaultLimit,
      limit,
      errorsSample: ['该站点下没有 active 或 draft 状态的关键词。'],
      pickedTerms: [],
      pickedIds: [],
      ...(appliedFilter != null ? { appliedFilter } : {}),
    }
    return Response.json(r)
  }

  const errorsSample: string[] = []

  if (clusterBeforeEnqueue && mode === 'quick_wins' && keywords.length > 0) {
    const pool = keywords.slice(0, Math.min(limit, keywords.length))
    poolIds = new Set(pool.map((k) => k.id))
    const cr = await runKeywordClusterForSite({
      payload,
      siteId,
      keywordIds: pool.map((k) => k.id),
      minOverlap: clusterMinOverlap,
      refresh: body.refreshCluster === true,
    })
    if (!cr.ok) {
      poolIds = null
      if (errorsSample.length < 5) {
        errorsSample.push(`SERP 聚类失败：${cr.error}`)
      }
    } else {
      clustersOut = cr.clusters
      totalDfsCalls = cr.totalDfsCalls
      pillarIdSet = new Set(cr.pillarIds)
    }
  }

  let enqueued = 0
  let skipped = 0
  const pickedTerms: string[] = []
  const pickedIds: number[] = []
  const siteIdNum = siteId

  for (const row of keywords) {
    if (enqueued >= limit) break

    if (poolIds != null && !poolIds.has(row.id)) {
      continue
    }

    if (pillarIdSet.size > 0 && poolIds != null && !pillarIdSet.has(row.id)) {
      skipped += 1
      const cl = clustersOut?.find((c) => c.memberIds.includes(row.id))
      if (errorsSample.length < 8) {
        errorsSample.push(
          cl
            ? `keyword ${row.id} (${row.term}): 合并到 pillar=${cl.pillarTerm}（簇 ${cl.memberIds.length} 个）`
            : `keyword ${row.id} (${row.term}): 非 pillar，跳过入队`,
        )
      }
      continue
    }

    if (await hasPendingBriefJobForKeyword(payload, row.id)) {
      skipped += 1
      if (errorsSample.length < 5) {
        errorsSample.push(`keyword ${row.id} (${row.term}): 已有进行中的 brief_generate`)
      }
      continue
    }

    pickedTerms.push(row.term)
    pickedIds.push(row.id)

    if (dryRun) {
      enqueued += 1
      continue
    }

    const label = `Brief queue: ${row.term}`.slice(0, 120)
    await payload.create({
      collection: 'workflow-jobs',
      data: {
        label,
        jobType: 'brief_generate',
        status: 'pending',
        site: siteIdNum,
        pipelineKeyword: row.id,
        input: {
          keywordId: row.id,
          batch: true,
          siteId: siteIdNum,
          ...(mode === 'quick_wins' ? { quickWins: true } : {}),
        },
        ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
      },
    })
    enqueued += 1
  }

  const r: BatchEnqueueResult = {
    ok: true,
    mode,
    ...(dryRun ? { dryRun: true } : {}),
    enqueued,
    skipped,
    usedKeywordFallback: mode === 'default' ? usedFallback : false,
    defaultLimit,
    limit,
    errorsSample,
    pickedTerms,
    pickedIds,
    ...(appliedFilter != null ? { appliedFilter } : {}),
    ...(clustersOut != null ? { clusters: clustersOut } : {}),
    ...(totalDfsCalls != null ? { totalDfsCalls } : {}),
    ...(mode === 'quick_wins' ? { clusterBeforeEnqueue, clusterMinOverlap } : {}),
  }
  return Response.json(r)
}
