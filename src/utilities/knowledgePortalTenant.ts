import { cookies } from 'next/headers.js'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { getTenantIdsForUser } from '@/utilities/tenantScope'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'

/** 与 @payloadcms/plugin-multi-tenant Admin 一致，见 TenantSelectionProvider */
export const PAYLOAD_TENANT_COOKIE = 'payload-tenant'

type UsersUser = Config['user'] & { collection: 'users' }

/**
 * 阅读门户应只展示「当前所选租户」下的文档，与 Admin 里租户筛选项一致（Cookie `payload-tenant`）。
 * - 有 Cookie 且用户有权访问该租户：用其 id。
 * - 无/非法 Cookie：若用户仅绑定一个租户，用该 id；多租户则用列表中的第一个，避免与 Admin 的「在租户 A」视图不一致的歧义时仍要固定一侧栏。
 * - 超管：无 Cookie 时优先用用户 `tenants[]` 中的第一个；仍无则返回 `null`（不额外加 tenant 条件，与插件行为一致；建议在 Admin 中选中租户以写入 Cookie）。
 */
export async function resolvePortalTenantId(user: unknown): Promise<number | null> {
  if (!isUsersCollection(user)) return null
  const u = user as UsersUser
  const assigned = getTenantIdsForUser(u)
  const c = await cookies()
  const raw = c.get(PAYLOAD_TENANT_COOKIE)?.value
  const fromCookie =
    raw != null && raw !== '' && !Number.isNaN(parseInt(raw, 10)) ? parseInt(raw, 10) : null

  if (userHasUnscopedAdminAccess(u)) {
    if (fromCookie != null) return fromCookie
    if (assigned.length > 0) return assigned[0]!
    return null
  }

  if (fromCookie != null && assigned.includes(fromCookie)) return fromCookie
  if (assigned.length === 1) return assigned[0]!
  if (assigned.length > 1) {
    if (fromCookie != null && assigned.includes(fromCookie)) return fromCookie
    return assigned[0]!
  }
  return null
}
