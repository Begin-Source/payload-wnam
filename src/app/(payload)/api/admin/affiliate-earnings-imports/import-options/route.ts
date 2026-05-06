import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userMayWriteCommissions } from '@/utilities/financeRoleAccess'
import { getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!userMayWriteCommissions(user)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(userArg)
  if (scope.mode === 'none') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where =
    scope.mode === 'all'
      ? undefined
      : ({ id: { in: scope.tenantIds } } as const)

  const res = await payload.find({
    collection: 'tenants',
    ...(where ? { where } : {}),
    limit: 200,
    depth: 0,
    sort: 'name',
    overrideAccess: true,
  })

  const tenants = res.docs.map((t) => ({
    id: typeof t.id === 'number' ? t.id : Number(t.id),
    name: typeof (t as { name?: string }).name === 'string' ? (t as { name: string }).name : '',
    slug: typeof (t as { slug?: string }).slug === 'string' ? (t as { slug: string }).slug : '',
  }))

  return Response.json({
    tenants,
    tenantChoiceRequired:
      scope.mode === 'all' || (scope.mode === 'tenants' && scope.tenantIds.length > 1),
  })
}
