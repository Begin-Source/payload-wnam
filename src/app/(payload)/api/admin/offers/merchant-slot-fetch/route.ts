import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { extractDataForSeoCostUsd } from '@/services/integrations/dataforseo/extractDataForSeoCostUsd'
import { formatMerchantSlotTag } from '@/utilities/merchantSlotTag'
import {
  parseStoredSummaryRecord,
  stringifySummaryRecord,
} from '@/collections/shared/sanitizeMerchantJsonFields'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

export const dynamic = 'force-dynamic'

const DFS_PATH = '/v3/merchant/amazon/products/task_post'

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

function requestOrigin(request: Request): string {
  const env = process.env.PAYLOAD_PUBLIC_SERVER_URL ?? process.env.NEXT_PUBLIC_SERVER_URL
  if (env) return env.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

function readSummarySeedFetched(raw: unknown): boolean {
  if (raw && typeof raw === 'object' && 'seedStatus' in raw) {
    return String((raw as { seedStatus?: string }).seedStatus ?? '').toLowerCase() === 'fetched'
  }
  return false
}

/**
 * 派发 DFS 成功后，将与「站点 + 类目」匹配的 Offer 槽位标记为 running，便于 Offer 列表与类目侧状态一致。
 */
async function markOffersMerchantSlotRunningForCategory(
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
  categoryId: number,
  batchUuid: string,
  now: string,
): Promise<number> {
  const found = await payload.find({
    collection: 'offers',
    where: {
      and: [{ sites: { contains: siteId } }, { categories: { contains: categoryId } }],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  let n = 0
  for (const doc of found.docs) {
    await payload.update({
      collection: 'offers',
      id: doc.id,
      data: {
        merchantSlot: {
          workflowStatus: 'running',
          workflowUpdatedAt: now,
          workflowLog: `DFS dispatched · batch ${batchUuid}`,
          batchId: batchUuid,
          sourceCategoryId: categoryId,
        },
      },
      overrideAccess: true,
    })
    n++
  }
  return n
}

/**
 * POST { siteId: number, categoryIds: number[], fetchAsinLimit?: number, force?: boolean }
 * Marks categories running, stores batch + summary, dispatches DataForSEO Amazon Products `task_post`
 * with postback to `/api/webhooks/dataforseo-merchant-offers`.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    siteId?: unknown
    categoryIds?: unknown
    fetchAsinLimit?: unknown
    force?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const rawIds = body.categoryIds
  const categoryIds: number[] =
    Array.isArray(rawIds) ?
      rawIds
        .map((x) => (typeof x === 'number' ? x : Number(x)))
        .filter((n) => Number.isFinite(n))
    : []

  if (categoryIds.length === 0) {
    return Response.json({ error: 'categoryIds must be a non-empty array' }, { status: 400 })
  }

  const fetchAsinLimit = Math.max(
    1,
    Math.min(
      20,
      typeof body.fetchAsinLimit === 'number' && Number.isFinite(body.fetchAsinLimit) ?
        Number(body.fetchAsinLimit)
      : Number(body.fetchAsinLimit) || 5,
    ),
  )

  const force = body.force === true || body.force === 1 || body.force === 'true'

  const scope = getTenantScopeForStats(user)
  const siteRow = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })
  if (!siteRow) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }
  const siteTenantId = tenantIdFromRelation(
    (siteRow as { tenant?: number | { id: number } | null }).tenant,
  )
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const postbackToken = process.env.OFFER_MERCHANT_POSTBACK_SECRET ?? 'dfs_postback_v1'
  const origin = requestOrigin(request)
  const postbackUrl = `${origin}/api/webhooks/dataforseo-merchant-offers?token=${encodeURIComponent(postbackToken)}`

  const batchUuid = crypto.randomUUID()
  const dispatched: {
    categoryId: number
    ok: boolean
    tag?: string
    skipped?: boolean
    error?: string
    offersMarkedRunning?: number
  }[] = []

  for (const categoryId of categoryIds) {
    const cat = await payload.findByID({
      collection: 'categories',
      id: categoryId,
      depth: 0,
    })
    if (!cat) {
      dispatched.push({ categoryId, ok: false, error: 'Category not found' })
      continue
    }

    const catSite = parseRelationshipId((cat as { site?: unknown }).site)
    if (catSite !== siteId) {
      dispatched.push({ categoryId, ok: false, error: 'Category site mismatch' })
      continue
    }

    const summary = parseStoredSummaryRecord(
      (cat as { merchantOfferFetchLastSummary?: unknown }).merchantOfferFetchLastSummary,
    )
    if (!force && readSummarySeedFetched(summary)) {
      dispatched.push({ categoryId, ok: true, skipped: true })
      continue
    }

    const tag = formatMerchantSlotTag(categoryId, batchUuid)
    const keyword = String((cat as { name?: string }).name ?? '').trim()

    const now = new Date().toISOString()

    try {
      await payload.update({
        collection: 'categories',
        id: categoryId,
        data: {
          merchantOfferFetchWorkflowStatus: 'running',
          merchantOfferFetchLastBatchId: batchUuid,
          merchantOfferFetchDfTaskTag: tag,
          merchantOfferFetchLastSummary: stringifySummaryRecord({
            seedStatus: 'pending',
            fetchAsinLimit,
            keyword,
            batchId: batchUuid,
            dispatchedAt: now,
          }),
          merchantOfferFetchWorkflowLog: `Dispatching DFS (${DFS_PATH}) · tag ${tag}`,
        },
        overrideAccess: true,
      })

      const envPost = await dataForSeoPost(DFS_PATH, [
        {
          location_name: 'United States',
          language_name: 'English (United States)',
          keyword: keyword || 'amazon',
          priority: 2,
          tag,
          postback_data: 'advanced',
          postback_url: postbackUrl,
        },
      ])

      try {
        const usd = extractDataForSeoCostUsd(envPost)
        if (usd > 0) {
          await incrementSiteQuotaUsage(payload, siteId, { dataForSeoUsd: usd })
        }
      } catch {
        /* quota optional */
      }

      let offersMarkedRunning = 0
      try {
        offersMarkedRunning = await markOffersMerchantSlotRunningForCategory(
          payload,
          siteId,
          categoryId,
          batchUuid,
          now,
        )
      } catch {
        /** 不影响派发成功语义；类目已为 running */
      }

      dispatched.push({ categoryId, ok: true, tag, offersMarkedRunning })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await payload.update({
        collection: 'categories',
        id: categoryId,
        data: {
          merchantOfferFetchWorkflowStatus: 'error',
          merchantOfferFetchWorkflowLog: `Dispatch failed: ${msg.slice(0, 1500)}`,
        },
        overrideAccess: true,
      })
      dispatched.push({ categoryId, ok: false, error: msg })
    }
  }

  const offersMarkedRunningTotal = dispatched.reduce(
    (acc, r) => acc + (typeof r.offersMarkedRunning === 'number' ? r.offersMarkedRunning : 0),
    0,
  )

  return Response.json({
    ok: true,
    batchId: batchUuid,
    siteId,
    fetchAsinLimit,
    postbackUrlConfigured: true,
    offersMarkedRunningTotal,
    results: dispatched,
  })
}
