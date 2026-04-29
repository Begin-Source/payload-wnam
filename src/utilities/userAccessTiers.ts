import type { Access } from 'payload'

import type { Config } from '@/payload-types'
import { denyFinanceOnlyUnlessWhitelisted } from '@/utilities/financeRoleAccess'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import type { AppUserRole } from '@/utilities/userRoles'
import { getUserRoles, userHasRole } from '@/utilities/userRoles'

/** Any role that grants more than the plain 公告-only portal. */
const PRIVILEGED_ROLES = new Set<AppUserRole | string>([
  'super-admin',
  'system-admin',
  'finance',
  'ops-manager',
  'team-lead',
  'site-manager',
  'general-manager',
])

export function userHasPrivilegedRole(user: Config['user'] | null | undefined): boolean {
  if (!isUsersCollection(user)) return false
  return getUserRoles(user as never).some((r) => PRIVILEGED_ROLES.has(r))
}

/**
 * 仅「平民」：已登录 `users`、非超管、且角色里没有任何特权角色（见 `PRIVILEGED_ROLES`）。
 * 此类账号在 Admin 中只允许访问白名单（如 `announcements`）。
 */
export function userIsAnnouncementsPortalOnly(user: Config['user'] | null | undefined): boolean {
  if (!isUsersCollection(user) || !user) return false
  if (userHasUnscopedAdminAccess(user)) return false
  return !getUserRoles(user as never).some((r) => PRIVILEGED_ROLES.has(r))
}

/** 含 `finance` 且无全租户超管能力 — 不得创建 `users`（含与 ops 并存）。 */
export function userHasFinanceRoleNonSuper(user: Config['user'] | null | undefined): boolean {
  if (!isUsersCollection(user) || !user) return false
  if (userHasUnscopedAdminAccess(user)) return false
  return userHasRole(user as never, 'finance')
}

/**
 * 纯站长：有 `site-manager`、无全租户能力，且**没有** `team-lead` 与 `ops-manager`（兼岗仍可按组长/运营访问用户）。
 */
export function userIsPureSiteManagerWithoutTeamOrOps(
  user: Config['user'] | null | undefined,
): boolean {
  if (!isUsersCollection(user) || !user) return false
  if (userHasUnscopedAdminAccess(user)) return false
  if (userHasRole(user as never, 'general-manager')) return false
  if (!userHasRole(user as never, 'site-manager')) return false
  if (userHasRole(user as never, 'team-lead') || userHasRole(user as never, 'ops-manager')) {
    return false
  }
  return true
}

/** 仅公告类账号在 Admin 中除自身业务外可读的集合。 */
export const ANNOUNCEMENTS_PORTAL_COLLECTION_SLUGS = [
  'announcements',
  'operation-manuals',
] as const

export function announcementsPortalBlocksCollection(
  user: Config['user'] | null | undefined,
  collectionSlug: string,
): boolean {
  if (!userIsAnnouncementsPortalOnly(user)) return false
  return !ANNOUNCEMENTS_PORTAL_COLLECTION_SLUGS.includes(
    collectionSlug as (typeof ANNOUNCEMENTS_PORTAL_COLLECTION_SLUGS)[number],
  )
}

/** 纯公告 portal 用户：除 `announcements` 外不能读任何 Global。 */
export function announcementsPortalBlocksGlobal(
  user: Config['user'] | null | undefined,
  _globalSlug: string,
): boolean {
  if (!userIsAnnouncementsPortalOnly(user)) return false
  return true
}

/** 非特权账号仅允许 `announcements` 等业务白名单。 */
export function denyAnnouncementsPortalOnlyUnlessWhitelisted(
  collectionSlug: string,
  inner: Access,
): Access {
  return (args) => {
    if (announcementsPortalBlocksCollection(args.req.user, collectionSlug)) return false
    return inner(args)
  }
}

/** 先拦截仅公告账号，再拦截仅财务白名单，最后执行 `inner`（与 `loggedInSuperAdminAccessFor` 一致）。 */
export function denyPortalAndFinanceCollection(collectionSlug: string, inner: Access): Access {
  return denyAnnouncementsPortalOnlyUnlessWhitelisted(
    collectionSlug,
    denyFinanceOnlyUnlessWhitelisted(collectionSlug, inner),
  )
}
