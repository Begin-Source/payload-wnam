import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

type ProfileOption = {
  id: number
  name: string
  slug: string
  isDefault: boolean
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

/**
 * GET ?siteId= — list pipeline profiles for the site's tenant (tenant-scoped admin).
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)
  const url = new URL(request.url)
  const siteIdRaw = url.searchParams.get('siteId')
  const siteId = siteIdRaw != null && siteIdRaw !== '' ? Number(siteIdRaw) : NaN
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId required (number)' }, { status: 400 })
  }

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
    return Response.json({ profiles: [] as ProfileOption[] })
  }

  const result = await payload.find({
    collection: 'pipeline-profiles',
    where: { tenant: { equals: siteTenantId } },
    limit: 200,
    sort: 'name',
    depth: 0,
  })

  const profiles: ProfileOption[] = result.docs.map((doc) => ({
    id: doc.id,
    name: typeof doc.name === 'string' ? doc.name : String(doc.id),
    slug: typeof doc.slug === 'string' ? doc.slug : '',
    isDefault: doc.isDefault === true,
  }))

  return Response.json({ profiles })
}
