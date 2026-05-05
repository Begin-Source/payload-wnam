import type { Payload } from 'payload'

import { tenantIdFromRelation } from '@/utilities/tenantScope'

export async function resolveOptionalPipelineTenant(
  payload: Payload,
  opts: { tenantId?: number | null; siteId?: number | null },
): Promise<number | null> {
  const rawTid = opts.tenantId
  if (typeof rawTid === 'number' && Number.isFinite(rawTid)) return rawTid
  const sid = opts.siteId
  if (typeof sid !== 'number' || !Number.isFinite(sid)) return null
  try {
    const site = await payload.findByID({
      collection: 'sites',
      id: sid,
      depth: 0,
      overrideAccess: true,
    })
    if (!site) return null
    return tenantIdFromRelation(
      (site as { tenant?: number | { id: number } | null | undefined }).tenant,
    )
  } catch {
    return null
  }
}
