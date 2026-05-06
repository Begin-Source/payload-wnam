import type { CollectionBeforeChangeHook } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { getTenantIdsForUser } from '@/utilities/tenantScope'

function tenantIdsFromData(data: Record<string, unknown>): number[] {
  const rows = data.tenants
  if (!Array.isArray(rows)) return []
  const ids: number[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const t = (row as { tenant?: unknown }).tenant
    const id =
      typeof t === 'object' && t !== null && 'id' in t
        ? Number((t as { id: unknown }).id)
        : typeof t === 'number'
          ? t
          : NaN
    if (Number.isFinite(id)) ids.push(id)
  }
  return ids
}

function pctInRange(v: unknown, label: string): void {
  if (v === undefined || v === null || v === '') return
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`${label} 须在 0–100 之间`)
  }
}

/**
 * Amazon tracking id unique per tenant among users who share any tenant with this doc.
 */
export const validateUserAffiliateFields: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const next = { ...data } as Record<string, unknown>
  const tagRaw = next.amazonTrackingId
  const tag =
    typeof tagRaw === 'string' ? tagRaw.trim().toLowerCase() : String(tagRaw ?? '').trim().toLowerCase()
  if (tag) {
    next.amazonTrackingId = tag
  } else {
    next.amazonTrackingId = null
  }

  pctInRange(next.profitSharePct, '员工分成比例 profitSharePct')
  pctInRange(next.leaderCutPctOverride, '组长抽成覆盖 leaderCutPctOverride')
  pctInRange(next.opsCutPctOverride, '运营经理抽成覆盖 opsCutPctOverride')

  if (!tag) return next

  const selfId =
    operation === 'update' && originalDoc && typeof (originalDoc as { id?: unknown }).id === 'number'
      ? (originalDoc as { id: number }).id
      : null

  const merged: Record<string, unknown> =
    operation === 'update' && originalDoc && typeof originalDoc === 'object'
      ? { ...(originalDoc as Record<string, unknown>), ...next }
      : next
  const tenantIds = tenantIdsFromData(merged)
  if (tenantIds.length === 0) {
    throw new Error('请先为用户分配所属租户，再填写 Amazon Tracking ID')
  }

  const dup = await req.payload.find({
    collection: 'users',
    where: {
      and: [
        { amazonTrackingId: { equals: tag } },
        ...(selfId != null ? [{ id: { not_equals: selfId } }] : []),
      ],
    },
    limit: 50,
    depth: 0,
  })

  for (const u of dup.docs) {
    const other = u as Config['user'] & { collection: 'users' }
    if (!isUsersCollection(other)) continue
    const otherTenants = getTenantIdsForUser(other)
    const overlap = tenantIds.some((t) => otherTenants.includes(t))
    if (overlap) {
      throw new Error(`Amazon Tracking ID「${tag}」在本租户范围内已被其他用户使用`)
    }
  }

  return next
}
