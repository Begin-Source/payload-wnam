import type { CollectionBeforeChangeHook } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { getQuotaRulesMatrix } from '@/utilities/quotaRulesMatrix'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'

function tenantIdFromSitePayload(
  data: Record<string, unknown>,
  originalDoc: unknown,
): number | null {
  const pick = (t: unknown): number | null => {
    if (typeof t === 'number' && Number.isFinite(t)) return t
    if (typeof t === 'object' && t !== null && 'id' in t) {
      const id = (t as { id: unknown }).id
      if (typeof id === 'number' && Number.isFinite(id)) return id
    }
    return null
  }
  if (Object.prototype.hasOwnProperty.call(data, 'tenant')) {
    return pick(data.tenant)
  }
  if (originalDoc && typeof originalDoc === 'object' && 'tenant' in originalDoc) {
    return pick((originalDoc as Record<string, unknown>).tenant)
  }
  return null
}

/** Blocks `sites` create when `quota-rules.rules.maxSitesPerTenant` exceeded (non–super-admin). */
export const enforceSitesMatrixQuota: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (operation !== 'create') return data
  if (!isUsersCollection(req.user) || userHasUnscopedAdminAccess(req.user)) return data

  const { maxSitesPerTenant } = await getQuotaRulesMatrix(req.payload)
  if (maxSitesPerTenant == null || maxSitesPerTenant <= 0) return data

  const tenantId = tenantIdFromSitePayload(data as Record<string, unknown>, originalDoc)
  if (tenantId == null) return data

  const count = await req.payload.count({
    collection: 'sites',
    where: { tenant: { equals: tenantId } },
    req,
    overrideAccess: true,
  })

  if (count >= maxSitesPerTenant) {
    throw new Error(
      `已達租戶站點上限（${maxSitesPerTenant}）。請在「系統 → 配額規則」調整 maxSitesPerTenant 或聯繫管理員。`,
    )
  }
  return data
}
