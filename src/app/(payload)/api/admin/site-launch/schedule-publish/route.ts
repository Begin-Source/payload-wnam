import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  dailyPostCapForSite,
  evaluateArticlePublishEligibility,
} from '@/utilities/articlePublishScheduling'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(tenant: number | { id: number } | null | undefined): number | null {
  if (tenant == null) return null
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

function numberOr(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/**
 * POST { siteId, limit?, startAt?, minQualityScore? }
 * Evaluates draft articles and schedules eligible ones without publishing immediately.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = numberOr(body.siteId, NaN, 1, Number.MAX_SAFE_INTEGER)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const site = await payload.findByID({ collection: 'sites', id: siteId, depth: 0 })
  if (!site) return Response.json({ error: 'Site not found' }, { status: 404 })
  const siteTenantId = tenantIdFromRelation((site as { tenant?: number | { id: number } | null }).tenant)
  if (!siteAccessible(getTenantScopeForStats(user), siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = numberOr(body.limit, 30, 1, 100)
  const minQualityScore = numberOr(body.minQualityScore, 80, 50, 100)
  const cap = await dailyPostCapForSite(payload, siteId)
  const spacingMs = Math.max(1, Math.floor(24 / Math.max(1, cap))) * 3600000
  const startAtRaw = typeof body.startAt === 'string' ? Date.parse(body.startAt) : NaN
  const startAt = Number.isFinite(startAtRaw) ? new Date(startAtRaw) : new Date(Date.now() + 3600000)

  const res = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { site: { equals: siteId } },
        { status: { equals: 'draft' } },
        {
          or: [
            { publishQueueStatus: { exists: false } },
            { publishQueueStatus: { equals: 'none' } },
            { publishQueueStatus: { equals: 'blocked' } },
          ],
        },
      ],
    },
    limit: 200,
    depth: 0,
    sort: 'createdAt',
    overrideAccess: true,
  })

  let queued = 0
  let blocked = 0
  const samples: Array<{ id: number | string; title?: string; status: 'queued' | 'blocked'; reason?: string }> = []

  for (const article of res.docs as unknown as Array<Record<string, unknown> & { id: number | string; title?: string }>) {
    if (queued >= limit) break
    const check = evaluateArticlePublishEligibility(article, { minQualityScore })
    if (!check.eligible) {
      blocked += 1
      const reason = check.reasons.join(', ')
      await payload.update({
        collection: 'articles',
        id: article.id,
        data: {
          publishQueueStatus: 'blocked',
          publishEligible: false,
          publishBlockedReason: reason,
        },
        overrideAccess: true,
      })
      if (samples.length < 10) samples.push({ id: article.id, title: article.title, status: 'blocked', reason })
      continue
    }

    const scheduledAt = new Date(startAt.getTime() + queued * spacingMs)
    await payload.update({
      collection: 'articles',
      id: article.id,
      data: {
        publishQueueStatus: 'queued',
        publishEligible: true,
        publishBlockedReason: '',
        scheduledPublishAt: scheduledAt.toISOString(),
      },
      overrideAccess: true,
    })
    queued += 1
    if (samples.length < 10) samples.push({ id: article.id, title: article.title, status: 'queued' })
  }

  return Response.json({
    ok: true,
    siteId,
    dailyPostCap: cap,
    queued,
    blocked,
    scanned: res.docs.length,
    samples,
  })
}
