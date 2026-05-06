import type { Access } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getUserRoles, userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

/**
 * Collections a finance-only admin may access (sidebar 财务；多租户同上)。
 * 含 `operation-manuals`：财务经理可读已发布流程说明（只读）；写仍为超管 / 运维 / system-admin。
 */
export const FINANCE_COLLECTION_SLUGS = [
  'commissions',
  'operation-manuals',
  'affiliate-earnings-imports',
  'affiliate-earnings-rows',
  'commission-statements',
] as const

/** Globals finance-only users may read (writes follow per-global rules). */
export const FINANCE_GLOBAL_SLUGS = ['commission-rules'] as const

/**
 * Finance-only view: has `finance`, not full-tenant admin, and not `ops-manager`
 * (ops uses tenant-wide read including finance; see plan).
 */
export function userIsFinanceManagerOnly(user: Config['user'] | null | undefined): boolean {
  if (!isUsersCollection(user)) return false
  if (userHasUnscopedAdminAccess(user)) return false
  if (userHasTenantGeneralManagerRole(user)) return false
  const roles = getUserRoles(user)
  if (!roles.includes('finance')) return false
  if (roles.includes('ops-manager')) return false
  return true
}

export function financeOnlyBlocksCollection(
  user: Config['user'] | null | undefined,
  collectionSlug: string,
): boolean {
  if (!userIsFinanceManagerOnly(user)) return false
  return !FINANCE_COLLECTION_SLUGS.includes(collectionSlug as (typeof FINANCE_COLLECTION_SLUGS)[number])
}

export function financeOnlyBlocksGlobal(
  user: Config['user'] | null | undefined,
  globalSlug: string,
): boolean {
  if (!userIsFinanceManagerOnly(user)) return false
  return !FINANCE_GLOBAL_SLUGS.includes(globalSlug as (typeof FINANCE_GLOBAL_SLUGS)[number])
}

/** Wrap collection `access` so finance-only users are limited to `FINANCE_COLLECTION_SLUGS`. */
export function denyFinanceOnlyUnlessWhitelisted(collectionSlug: string, inner: Access): Access {
  return (args) => {
    if (financeOnlyBlocksCollection(args.req.user, collectionSlug)) return false
    return inner(args)
  }
}

/** Commissions writes: super-admin / env, `finance`, or tenant 总经理. */
export function userMayWriteCommissions(user: Config['user'] | null | undefined): boolean {
  if (!user) return false
  if (userHasUnscopedAdminAccess(user)) return true
  if (isUsersCollection(user) && userHasRole(user, 'finance')) return true
  if (userHasTenantGeneralManagerRole(user)) return true
  return false
}

const COMMISSION_RULES_READ_ROLES = [
  'finance',
  'ops-manager',
  'team-lead',
  'site-manager',
  'general-manager',
] as const

/** Global `commission-rules`: read for super, finance-only, finance+ops, and team/site roles. */
export function canReadCommissionRulesGlobal(user: Config['user'] | null | undefined): boolean {
  if (!user) return false
  if (userHasUnscopedAdminAccess(user)) return true
  if (!isUsersCollection(user)) return false
  if (userIsFinanceManagerOnly(user)) return true
  const roles = getUserRoles(user)
  return COMMISSION_RULES_READ_ROLES.some((r) => roles.includes(r))
}

/** Global `commission-rules`: update only super-admin-like or finance manager. */
export function canUpdateCommissionRulesGlobal(user: Config['user'] | null | undefined): boolean {
  if (!user) return false
  if (userHasUnscopedAdminAccess(user)) return true
  if (!isUsersCollection(user)) return false
  return userHasRole(user, 'finance')
}
