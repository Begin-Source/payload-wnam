import type { Payload } from 'payload'

import { parseRelationshipId } from '@/utilities/parseRelationshipId'

/**
 * Set slot workflow status on all categories for a site (job / error paths).
 * Always sets `tenant` from the owning site so multi-tenant field validation passes
 * (server jobs have no admin `req` / cookie tenant) and legacy rows with null tenant_id are repaired.
 */
export async function syncCategorySlotsWorkflowToCategories(
  payload: Payload,
  siteId: number,
  status: string,
  siteTenantId: number,
): Promise<void> {
  let page = 1
  const limit = 100
  while (true) {
    const batch = await payload.find({
      collection: 'categories',
      where: { site: { equals: siteId } },
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of batch.docs) {
      const id = (doc as { id: number }).id
      await payload.update({
        collection: 'categories',
        id,
        data: {
          categorySlotsWorkflowStatus: status,
          tenant: siteTenantId,
        },
        overrideAccess: true,
      })
    }
    if (batch.docs.length < limit) break
    page += 1
  }
}

/** Resolve site's tenant for workflow sync (e.g. error path when loadContext did not return ok). */
export async function siteTenantIdForCategorySync(
  payload: Payload,
  siteId: number,
): Promise<number | null> {
  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })
  if (!site) return null
  return parseRelationshipId((site as { tenant?: unknown }).tenant)
}
