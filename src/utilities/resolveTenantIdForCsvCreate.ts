import { cookies } from 'next/headers.js'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { PAYLOAD_TENANT_COOKIE } from '@/utilities/knowledgePortalTenant'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantIdsForUser, type TenantScope } from '@/utilities/tenantScope'

/**
 * 多租户集合 CSV 新建行必须带 `tenant`；API 无 Admin 的 TenantSelector，故从 Cookie
 * `payload-tenant`、Form `tenantId`、用户已分配租户、或（超管时）库内第一条 `tenants` 解析目标租户 id。
 */
export async function resolveTenantIdForCsvCreate(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: Config['user'] & { collection: 'users' },
  scope: TenantScope,
  formTenantIdRaw: string | null,
): Promise<number | null> {
  const formTid = formTenantIdRaw?.trim()
  if (formTid) {
    const n = Number(formTid)
    if (Number.isFinite(n)) {
      if (scope.mode === 'tenants' && !scope.tenantIds.includes(n)) {
        return null
      }
      return n
    }
  }

  const raw = (await cookies()).get(PAYLOAD_TENANT_COOKIE)?.value
  const fromCookie =
    raw != null && raw !== '' && !Number.isNaN(parseInt(raw, 10)) ? parseInt(raw, 10) : null
  const assigned = getTenantIdsForUser(user)

  if (scope.mode === 'tenants') {
    if (scope.tenantIds.length === 0) return null
    if (scope.tenantIds.length === 1) return scope.tenantIds[0]!
    if (fromCookie != null && scope.tenantIds.includes(fromCookie)) return fromCookie
    return scope.tenantIds[0]!
  }

  if (scope.mode === 'all' && userHasUnscopedAdminAccess(user)) {
    if (fromCookie != null) return fromCookie
    if (assigned.length > 0) return assigned[0]!
    const t = await payload.find({ collection: 'tenants', limit: 1, depth: 0, overrideAccess: true })
    const id = t.docs[0]?.id
    return typeof id === 'number' ? id : null
  }

  if (fromCookie != null) return fromCookie
  if (assigned.length > 0) return assigned[0]!
  return null
}
