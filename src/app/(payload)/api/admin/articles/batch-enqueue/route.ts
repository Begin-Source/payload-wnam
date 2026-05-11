import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { defaultBatchLimitFromDailyCap } from '@/utilities/briefBatchDefaults'
import {
  loadKeywordBatchCandidates,
  parseKeywordBatchMode,
  type KeywordBatchMode,
  type KeywordBatchRow,
} from '@/utilities/keywordBatchModes'
import { mergeQuickWinFilter, quickWinDefaultLimit, type QuickWinFilter } from '@/utilities/quickWinFilter'
import type { KeywordClusterOutputCluster } from '@/utilities/keywordClusterPipeline'
import { runKeywordClusterForSite } from '@/utilities/keywordClusterPipeline'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'
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

async function hasPendingRefreshJobForArticle(
  payload: Awaited<ReturnType<typeof getPayload>>,
  articleId: number,
): Promise<boolean> {
  const c = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'content_refresh' } },
        { status: { in: ['pending', 'running'] } },
        { article: { equals: articleId } },
      ],
    },
  })
  return c.totalDocs > 0
}

export type BatchEnqueueResult = {
  ok: true
  mode: KeywordBatchMode
  dryRun?: boolean
  enqueued: number
  skipped: number
  usedKeywordFallback: boolean
  defaultLimit: number
  limit: number
  errorsSample: string[]
  pickedTerms?: string[]
  pickedIds?: number[]
  pickedArticleIds?: number[]
  appliedFilter?: QuickWinFilter | Record<string, unknown>
  clusters?: KeywordClusterOutputCluster[]
  totalDfsCalls?: number
  clusterBeforeEnqueue?: boolean
  clusterMinOverlap?: number
  jobType?: 'brief_generate' | 'content_refresh'
  pickedRefreshMeta?: Array<{
    keywordId: number
    articleId: number
    decayScore: number
    decayReason: string
  }>
  pickedSeasonalMeta?: Array<{ term: string; seasonalScore: number }>
}

/**
 * POST { siteId, limit?, mode?, dryRun?, filter?, clusterBeforeEnqueue?, clusterMinOverlap?, refreshCluster?,
 *        pillarId?, minSeasonalScore?, decayThreshold?, geoIntentWhitelist?, geoQuestionOnly? }
 * Tenant-scoped; enqueues `brief_generate` or `content_refresh` per mode.
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

  const mode = parseKeywordBatchMode(typeof body.mode === 'string' ? body.mode : 'default')
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

  const loaded = await loadKeywordBatchCandidates(
    payload,
    siteId,
    mode,
    body,
    defaultLimit,
  )

  const keywords: KeywordBatchRow[] = loaded.rows
  const usedFallback = loaded.usedKeywordFallback
  const appliedFilter = loaded.appliedFilter
  const jobType = loaded.jobType

  if (mode === 'quick_wins' && keywords.length === 0) {
    const r: BatchEnqueueResult = {
      ok: true,
      mode,
      ...(dryRun ? { dryRun: true } : {}),
      jobType: 'brief_generate',
      enqueued: 0,
      skipped: 0,
      usedKeywordFallback: false,
      defaultLimit,
      limit: Math.min(Math.max(1, quickWinDefaultLimit(filterMerged, defaultLimit)), 100),
      errorsSample: ['该站点没有符合 Quick-win 条件的关键词（eligible / KD / volume / intent）。'],
      pickedTerms: [],
      pickedIds: [],
      appliedFilter: filterMerged as QuickWinFilter,
    }
    return Response.json(r)
  }

  if (mode === 'pillar_sprint' && appliedFilter && 'error' in appliedFilter && appliedFilter.error) {
    return Response.json(
      {
        ok: false,
        error: String(appliedFilter.error),
      },
      { status: 400 },
    )
  }

  const limitQuickDefault =
    loaded.limitQuickDefault ?? quickWinDefaultLimit(filterMerged, defaultLimit)
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
    const msg =
      mode === 'geo_friendly'
        ? '没有 geoFriendly=true 且符合意图筛选的关键词（可先运行「回填 geo」或 DFS 同步）。'
        : mode === 'seasonal'
          ? '没有带 trend 或季节分未达阈值的关键词。'
          : mode === 'refresh_decay'
            ? '没有达衰减阈值的文章/关键词（可先跑 rank_track 积累位次快照）。'
            : '该站点下没有 active 或 draft 状态的关键词。'

    const r: BatchEnqueueResult = {
      ok: true,
      mode,
      ...(dryRun ? { dryRun: true } : {}),
      jobType,
      enqueued: 0,
      skipped: 0,
      usedKeywordFallback: false,
      defaultLimit,
      limit,
      errorsSample: [msg],
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
  const pickedArticleIds: number[] = []
  const pickedRefreshMeta: Array<{
    keywordId: number
    articleId: number
    decayScore: number
    decayReason: string
  }> = []
  const pickedSeasonalMeta: Array<{ term: string; seasonalScore: number }> = []
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

    if (jobType === 'brief_generate') {
      if (await hasPendingBriefJobForKeyword(payload, row.id)) {
        skipped += 1
        if (errorsSample.length < 5) {
          errorsSample.push(`keyword ${row.id} (${row.term}): 已有进行中的 brief_generate`)
        }
        continue
      }
    } else if (jobType === 'content_refresh') {
      const aid = row.articleId
      if (aid == null || !Number.isFinite(aid)) {
        skipped += 1
        if (errorsSample.length < 5) {
          errorsSample.push(`keyword ${row.id}: 缺少 articleId，跳过`)
        }
        continue
      }
      if (await hasPendingRefreshJobForArticle(payload, aid)) {
        skipped += 1
        if (errorsSample.length < 5) {
          errorsSample.push(`article ${aid}: 已有进行中的 content_refresh`)
        }
        continue
      }
    }

    pickedTerms.push(row.term)
    pickedIds.push(row.id)
    if (row.articleId != null) pickedArticleIds.push(row.articleId)
    if (
      mode === 'refresh_decay' &&
      row.articleId != null &&
      row.decayScore != null &&
      row.decayReason != null
    ) {
      pickedRefreshMeta.push({
        keywordId: row.id,
        articleId: row.articleId,
        decayScore: row.decayScore,
        decayReason: row.decayReason,
      })
    }
    if (mode === 'seasonal' && row.seasonalScore != null) {
      pickedSeasonalMeta.push({ term: row.term, seasonalScore: row.seasonalScore })
    }

    if (dryRun) {
      enqueued += 1
      continue
    }

    const labelBase =
      jobType === 'content_refresh'
        ? `Refresh: ${row.term}`.slice(0, 120)
        : `Brief queue: ${row.term}`.slice(0, 120)

    const inputPayload: Record<string, unknown> =
      jobType === 'content_refresh'
        ? {
            keywordId: row.id,
            articleId: row.articleId,
            batch: true,
            siteId: siteIdNum,
            decayReason: row.decayReason ?? '',
            decayScore: row.decayScore,
          }
        : {
            keywordId: row.id,
            batch: true,
            siteId: siteIdNum,
            ...(loaded.briefQuickWins ? { quickWins: true } : {}),
            ...(row.seasonalScore != null ? { seasonalScore: row.seasonalScore } : {}),
            ...(typeof body.pipelineProfileId === 'number' && Number.isFinite(body.pipelineProfileId)
              ? { pipelineProfileId: Math.floor(body.pipelineProfileId) }
              : typeof body.pipelineProfileId === 'string' && /^\d+$/.test(String(body.pipelineProfileId).trim())
                ? { pipelineProfileId: Number(String(body.pipelineProfileId).trim()) }
                : {}),
          }

    await payload.create({
      collection: 'workflow-jobs',
      data: {
        label: labelBase,
        jobType,
        status: 'pending',
        site: siteIdNum,
        pipelineKeyword: row.id,
        ...(jobType === 'content_refresh' && row.articleId != null
          ? { article: row.articleId }
          : {}),
        input: inputPayload,
        ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
      },
    })
    enqueued += 1
  }

  const r: BatchEnqueueResult = {
    ok: true,
    mode,
    ...(dryRun ? { dryRun: true } : {}),
    jobType,
    enqueued,
    skipped,
    usedKeywordFallback: mode === 'default' ? usedFallback : false,
    defaultLimit,
    limit,
    errorsSample,
    pickedTerms,
    pickedIds,
    ...(pickedArticleIds.length > 0 ? { pickedArticleIds } : {}),
    ...(pickedRefreshMeta.length > 0 ? { pickedRefreshMeta } : {}),
    ...(pickedSeasonalMeta.length > 0 ? { pickedSeasonalMeta } : {}),
    ...(appliedFilter != null ? { appliedFilter } : {}),
    ...(clustersOut != null ? { clusters: clustersOut } : {}),
    ...(totalDfsCalls != null ? { totalDfsCalls } : {}),
    ...(mode === 'quick_wins' ? { clusterBeforeEnqueue, clusterMinOverlap } : {}),
  }
  return Response.json(r)
}
