import type { Config } from '@/payload-types'

function superAdminEmails(): string[] {
  return (process.env.PAYLOAD_SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Super admins bypass tenant scoping (all tenants, all tenant-scoped documents).
 * Assign via Users → roles → "Super Admin", and/or set PAYLOAD_SUPER_ADMIN_EMAILS (comma-separated).
 *
 * `Config['user']` is a union when multiple auth collections exist (e.g. MCP API keys); only `users` can be super admins.
 */
export function userHasAllTenantAccess(user: Config['user'] | null | undefined): boolean {
  if (!user || user.collection !== 'users') return false
  if (!user.email) return false
  if (superAdminEmails().includes(user.email.toLowerCase())) return true
  const roles = user.roles
  return Array.isArray(roles) && roles.includes('super-admin')
}

/**
 * 全站无租户范围能力：真超管（见 `userHasAllTenantAccess`）或 `system-admin`。
 * 白标 Global 仍只用 `userHasAllTenantAccess`，系统管理员不可改。
 */
export function userHasUnscopedAdminAccess(user: Config['user'] | null | undefined): boolean {
  if (userHasAllTenantAccess(user)) return true
  if (!user || user.collection !== 'users' || !user.email) return false
  const roles = user.roles
  return Array.isArray(roles) && roles.includes('system-admin')
}
