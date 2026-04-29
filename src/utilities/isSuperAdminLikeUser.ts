/**
 * Works for `ClientUser` (admin.hidden) and server `User` — only uses `email` + `roles`.
 * Non-user principals (e.g. API keys) are treated as not super-admin.
 */
export function isSuperAdminLikeUser(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  const email = (user as { email?: string | null }).email
  if (!email) return false
  const fromEnv = (process.env.PAYLOAD_SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (fromEnv.includes(email.toLowerCase())) return true
  const roles = (user as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('super-admin')
}

/**
 * 系统类 Global 侧栏（非白标）：真超管或 `system-admin`。
 * **不要**用于 `admin-branding`；该处仍用 `isSuperAdminLikeUser`。
 */
export function isSystemConfigNavVisible(user: unknown): boolean {
  if (isSuperAdminLikeUser(user)) return true
  if (!user || typeof user !== 'object') return false
  const roles = (user as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('system-admin')
}
