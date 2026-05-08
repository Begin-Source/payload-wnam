import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
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

export type PillarOptionRow = {
  id: number
  term: string
  spokeCount: number
}

/**
 * GET ?siteId= — pillar keywords with ≥2 spokes (same site).
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const siteId = Number(url.searchParams.get('siteId'))
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
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

  const res = await payload.find({
    collection: 'keywords',
    where: {
      and: [{ site: { equals: siteId } }, { status: { in: ['active', 'draft'] } }],
    },
    limit: 500,
    depth: 0,
    user,
    overrideAccess: false,
  })

  const byId = new Map<number, { id: number; term: string }>()
  const spokeCount = new Map<number, number>()

  for (const d of res.docs as unknown as Array<{
    id: number
    term: string
    pillar?: number | { id: number } | null
  }>) {
    byId.set(d.id, { id: d.id, term: d.term })
    const p = d.pillar
    const pid = typeof p === 'number' ? p : p != null && typeof p === 'object' && 'id' in p ? Number((p as { id: number }).id) : null
    if (pid != null && Number.isFinite(pid) && pid !== d.id) {
      spokeCount.set(pid, (spokeCount.get(pid) ?? 0) + 1)
    }
  }

  const options: PillarOptionRow[] = []
  for (const [pid, count] of spokeCount) {
    if (count < 2) continue
    const row = byId.get(pid)
    if (!row) continue
    options.push({ id: row.id, term: row.term, spokeCount: count })
  }

  options.sort((a, b) => b.spokeCount - a.spokeCount || a.term.localeCompare(b.term))

  return Response.json({ pillars: options })
}
