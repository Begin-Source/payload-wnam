import type { Where } from 'payload'

import type { Config } from '@/payload-types'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'

export type TenantScope =
  | { mode: 'all' }
  | { mode: 'none' }
  | { mode: 'tenants'; tenantIds: number[] }

/** Normalize Payload relation `tenant` field to numeric id (sites, offers, etc.). */
export function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

/**
 * Parses `users.tenants[]` into numeric tenant ids.
 */
export function getTenantIdsForUser(
  user: Config['user'] & { collection: 'users' },
): number[] {
  const rows = user.tenants
  if (!Array.isArray(rows)) return []
  const ids: number[] = []
  for (const row of rows) {
    const t = row?.tenant
    const id = typeof t === 'object' && t !== null ? t.id : typeof t === 'number' ? t : null
    if (typeof id === 'number') ids.push(id)
  }
  return ids
}

/**
 * Super admin: no tenant filter (all tenants).
 * Normal user: tenant IN assigned ids.
 * User with no tenant assignments: empty scope (no documents).
 * 例如总经理等角色在 `users.tenants` 未配置时，多租户 `withTenantAccess` 会拒绝访问租户级集合，CSV/统计也拿不到数据。
 */
export function getTenantScopeForStats(
  user: Config['user'] & { collection: 'users' },
): TenantScope {
  if (userHasUnscopedAdminAccess(user)) return { mode: 'all' }
  const tenantIds = getTenantIdsForUser(user)
  if (tenantIds.length === 0) return { mode: 'none' }
  return { mode: 'tenants', tenantIds }
}

/** `where` fragment for `tenant` field, or undefined when mode is `all`. */
export function tenantWhereFromScope(scope: TenantScope): Where | undefined {
  if (scope.mode === 'all') return undefined
  if (scope.mode === 'none') return undefined
  return { tenant: { in: scope.tenantIds } }
}

/**
 * Combines optional tenant scope with extra query (e.g. status = published).
 * When scope is `none`, returns a predicate that matches nothing.
 */
export function combineTenantWhere(scope: TenantScope, extra?: Where): Where | undefined {
  if (scope.mode === 'none') {
    return { id: { equals: 0 } }
  }
  const tenantPart = tenantWhereFromScope(scope)
  if (!tenantPart && !extra) return undefined
  if (!tenantPart) return extra
  if (!extra) return tenantPart
  return { and: [tenantPart, extra] }
}
