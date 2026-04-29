import type { Where } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantIdsForUser } from '@/utilities/tenantScope'

/** 租户内列表不展示全站级账号行（`super-admin` / `system-admin` 可与业务租户有交集）。本人始终可访问自己的文档。 */
const ROLES_HIDDEN_FROM_TENANT_SCOPED_USER_LIST: readonly [string, string] = [
  'super-admin',
  'system-admin',
]

/**
 * Non–unscoped: self + 同租户用户，但排除行内为 `super-admin` 或 `system-admin` 的账号（不依赖对方是否再挂业务租户）。
 */
export function usersReadWhere(user: Config['user'] | null | undefined): boolean | Where {
  if (!isUsersCollection(user)) return false
  if (userHasUnscopedAdminAccess(user)) return true
  const tenantIds = getTenantIdsForUser(user)
  if (tenantIds.length === 0) return { id: { equals: user.id } }
  return {
    or: [
      { id: { equals: user.id } },
      {
        and: [
          { or: tenantIds.map((tid) => ({ 'tenants.tenant': { equals: tid } })) },
          { roles: { not_in: [...ROLES_HIDDEN_FROM_TENANT_SCOPED_USER_LIST] } },
        ],
      },
    ],
  }
}

export function usersUpdateWhere(user: Config['user'] | null | undefined): boolean | Where {
  return usersReadWhere(user)
}
