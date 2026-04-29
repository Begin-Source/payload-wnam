import type { User } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'

/** Values stored on `users.roles` (kebab-case). */
export const APP_USER_ROLES = [
  'user',
  'site-manager',
  'team-lead',
  'ops-manager',
  'finance',
  'general-manager',
  'system-admin',
  'super-admin',
] as const

export type AppUserRole = (typeof APP_USER_ROLES)[number]

export function getUserRoles(user: User | null | undefined): string[] {
  const roles = user?.roles
  if (!Array.isArray(roles)) return []
  return roles.map((r) => String(r))
}

export function userHasRole(user: User | null | undefined, role: AppUserRole | string): boolean {
  return getUserRoles(user).includes(role)
}

/** 总经理：租户内业务全权限；非全站超管（不用于 `userHasAllTenantAccess`）。 */
export function userHasTenantGeneralManagerRole(user: User | null | undefined): boolean {
  if (!isUsersCollection(user)) return false
  return userHasRole(user, 'general-manager')
}
