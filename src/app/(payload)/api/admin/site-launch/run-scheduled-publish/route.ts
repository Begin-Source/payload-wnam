import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runScheduledPublish } from '@/utilities/runScheduledPublish'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

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
 * Admin-authenticated manual trigger for due scheduled publishing.
 * POST { siteId, limit?, minQualityScore? }
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

  const limit = numberOr(body.limit, 20, 1, 100)
  const minQualityScore = numberOr(body.minQualityScore, 80, 50, 100)
  return Response.json(await runScheduledPublish(payload, {
    siteId,
    limit,
    minQualityScore,
  }))
}
