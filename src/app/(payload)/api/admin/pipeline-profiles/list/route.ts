import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import {
  pipelineProfileAdminAuth,
  profileTenantNumeric,
  tenantIdsForPipelineProfileList,
} from '@/utilities/pipelineProfileAdminAccess'

export const dynamic = 'force-dynamic'

type ListRow = {
  id: number
  name: string
  slug: string
  tenantId: number | null
  isDefault: boolean
}

/**
 * GET ?tenantId=
 * · 超管：必须传 tenantId。
 * · 租户范围用户：不传则列出其可见租户内的全部 profile；若在多个租户则建议传 tenantId。
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })

  const auth = pipelineProfileAdminAuth(user)
  if (!auth.ok) return auth.response

  const scopeTenants = tenantIdsForPipelineProfileList(auth.user)

  const url = new URL(request.url)
  const tenantIdRaw = url.searchParams.get('tenantId')
  const tenantIdParam =
    tenantIdRaw != null && tenantIdRaw !== '' ? Number(tenantIdRaw) : Number.NaN

  if (scopeTenants === 'none') {
    return Response.json({ error: 'No tenant assignments' }, { status: 403 })
  }

  let whereTenant: Where

  if (scopeTenants === 'all') {
    if (!Number.isFinite(tenantIdParam)) {
      return Response.json(
        { error: 'tenantId query required (number) when using all-tenant admin scope' },
        { status: 400 },
      )
    }
    whereTenant = { tenant: { equals: tenantIdParam } }
  } else if (Number.isFinite(tenantIdParam)) {
    if (!scopeTenants.includes(tenantIdParam)) {
      return Response.json({ error: 'tenantId not in your scope' }, { status: 403 })
    }
    whereTenant = { tenant: { equals: tenantIdParam } }
  } else if (scopeTenants.length === 1) {
    whereTenant = { tenant: { equals: scopeTenants[0] } }
  } else {
    whereTenant = { tenant: { in: scopeTenants } }
  }

  const res = await payload.find({
    collection: 'pipeline-profiles',
    where: whereTenant,
    limit: 200,
    sort: 'name',
    depth: 0,
    user: auth.user,
    overrideAccess: false,
  })

  const profiles: ListRow[] = res.docs.map((doc) => ({
    id: doc.id as number,
    name: typeof doc.name === 'string' ? doc.name : String(doc.id),
    slug: typeof doc.slug === 'string' ? doc.slug : '',
    tenantId: profileTenantNumeric(doc.tenant),
    isDefault: doc.isDefault === true,
  }))

  return Response.json({ profiles })
}
