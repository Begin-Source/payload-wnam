import type { PayloadRequest } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasPrivilegedRole } from '@/utilities/userAccessTiers'
import { getTenantIdsForUser, tenantIdFromRelation } from '@/utilities/tenantScope'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

export type PipelineProfileAdminAuth =
  | { ok: true; user: Config['user'] & { collection: 'users' } }
  | { ok: false; response: Response }

export function pipelineProfileAdminAuth(user: Config['user'] | null): PipelineProfileAdminAuth {
  if (!user || !isUsersCollection(user)) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (!(userHasPrivilegedRole(user) || userHasTenantGeneralManagerRole(user))) {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, user }
}

/** Back-compat shim if routes still pass `(user, req)` — `req` is unused. */
export function pipelineProfileAdminAuthResult(
  user: Config['user'] | null,
  _req?: PayloadRequest | null,
): PipelineProfileAdminAuth {
  void _req
  return pipelineProfileAdminAuth(user)
}

export function tenantIdsForPipelineProfileList(
  user: Config['user'] & { collection: 'users' },
): number[] | 'all' | 'none' {
  if (userHasUnscopedAdminAccess(user)) return 'all'
  const ids = getTenantIdsForUser(user)
  return ids.length ? ids : 'none'
}

export function userMayAccessPipelineProfileTenant(
  user: Config['user'] & { collection: 'users' },
  profileTenantId: number | null,
): boolean {
  if (userHasUnscopedAdminAccess(user) || userHasTenantGeneralManagerRole(user)) return true
  if (profileTenantId == null) return false
  return getTenantIdsForUser(user).includes(profileTenantId)
}

export function profileTenantNumeric(
  tenant: number | { id: number } | null | undefined,
): number | null {
  return tenantIdFromRelation(tenant)
}
