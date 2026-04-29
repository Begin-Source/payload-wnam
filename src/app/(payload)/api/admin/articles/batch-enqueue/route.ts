import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import { defaultBatchLimitFromDailyCap, sortKeywordDocsByOpportunity } from '@/utilities/briefBatchDefaults'
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
  enqueued: number
  skipped: number
  usedKeywordFallback: boolean
  defaultLimit: number
  limit: number
  errorsSample: string[]
}

/**
 * POST { siteId: number, limit?: number } — tenant-scoped; enqueues `brief_generate` jobs for top opportunity keywords.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { siteId?: unknown; limit?: unknown }
  try {
    body = (await request.json()) as { siteId?: unknown; limit?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

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
  const limitRaw = body.limit
  const limitFromBody =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : Number(limitRaw)
  const limit = Math.min(
    Math.max(
      1,
      Number.isFinite(limitFromBody) && limitFromBody > 0 ? Math.floor(limitFromBody) : defaultLimit,
    ),
    100,
  )

  const { keywords, usedFallback } = await loadKeywordCandidates(payload, siteId)
  if (keywords.length === 0) {
    const r: BatchEnqueueResult = {
      ok: true,
      enqueued: 0,
      skipped: 0,
      usedKeywordFallback: false,
      defaultLimit,
      limit,
      errorsSample: ['该站点下没有 active 或 draft 状态的关键词。'],
    }
    return Response.json(r)
  }

  const errorsSample: string[] = []
  let enqueued = 0
  let skipped = 0
  const siteIdNum = siteId

  for (const row of keywords) {
    if (enqueued >= limit) break
    if (await hasPendingBriefJobForKeyword(payload, row.id)) {
      skipped += 1
      if (errorsSample.length < 5) {
        errorsSample.push(`keyword ${row.id} (${row.term}): 已有进行中的 brief_generate`)
      }
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
        input: { keywordId: row.id, batch: true, siteId: siteIdNum },
        ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
      },
    })
    enqueued += 1
  }

  const r: BatchEnqueueResult = {
    ok: true,
    enqueued,
    skipped,
    usedKeywordFallback: usedFallback,
    defaultLimit,
    limit,
    errorsSample,
  }
  return Response.json(r)
}
