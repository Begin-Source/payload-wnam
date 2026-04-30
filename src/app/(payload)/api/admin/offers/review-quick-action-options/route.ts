import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

type OfferRow = {
  id: number
  title: string
  asin: string | null
}

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(
  scope: ReturnType<typeof getTenantScopeForStats>,
  siteTenantId: number | null,
): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

/**
 * GET ?siteId=<id> — offers where `sites` contains this site (tenant-scoped).
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const siteIdParam = url.searchParams.get('siteId')
  const siteId = Number(siteIdParam)
  if (!Number.isFinite(siteId) || siteId < 1) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

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
    return Response.json({ offers: [] as OfferRow[], totalLoaded: 0, cap: 500 })
  }

  const where = combineTenantWhere(scope, {
    sites: { contains: siteId },
  })

  const result = await payload.find({
    collection: 'offers',
    limit: 500,
    sort: '-updatedAt',
    depth: 0,
    overrideAccess: true,
    select: {
      title: true,
      slug: true,
      amazon: true,
    },
    ...(where ? { where } : {}),
  })

  const offers: OfferRow[] = result.docs.map((doc) => {
    const row = doc as typeof doc & {
      amazon?: { asin?: string | null } | null
    }
    return {
      id: doc.id,
      title: typeof row.title === 'string' ? row.title : String(row.title ?? ''),
      asin: row.amazon?.asin != null ? String(row.amazon.asin) : null,
    }
  })

  return Response.json({ offers, totalLoaded: offers.length, cap: 500 })
}
