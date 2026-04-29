import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  FieldHook,
} from 'payload'

import { parseRelationshipId } from '@/utilities/parseRelationshipId'

/** Aligns with `sites.siteLayout` (template1 | template2 | amz-template-1). */
export function normalizeMirroredSiteLayout(
  value: unknown,
): 'template1' | 'template2' | 'amz-template-1' {
  const v = String(value ?? '').toLowerCase().trim()
  if (v === 'template2') return 'template2'
  if (v === 'amz-template-1' || v === 'amz_template_1') return 'amz-template-1'
  return 'template1'
}

function siteIdFromBlueprintData(data: Record<string, unknown>): number | null {
  return parseRelationshipId(data.site)
}

/**
 * Runs on the multi-tenant `tenant` field's `beforeChange` (after collection `beforeChange`) so the value
 * wins over cookie/user defaults and matches `sites.tenant_id` for D1 FK `site_blueprints.tenant_id → tenants.id`.
 */
export const syncBlueprintTenantFromSiteTenantFieldBeforeChange: FieldHook = async ({
  siblingData,
  req,
}) => {
  const d = siblingData as Record<string, unknown>
  const siteId = siteIdFromBlueprintData(d)
  if (siteId == null) return undefined

  try {
    const site = await req.payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
    })
    const tid = parseRelationshipId((site as { tenant?: unknown }).tenant)
    if (tid == null) {
      d.tenant = null
      return null
    }
    d.tenant = tid
    return tid
  } catch {
    return undefined
  }
}

/**
 * Sets `mirroredSiteLayout` from the linked site's `siteLayout` so admin `condition` can show T1/T2 blocks.
 */
export const syncMirroredLayoutFromSiteBeforeChange: CollectionBeforeChangeHook = async ({
  data,
  req,
}) => {
  const d = data as Record<string, unknown>
  const siteId = siteIdFromBlueprintData(d)
  if (siteId == null) {
    d.mirroredSiteLayout = normalizeMirroredSiteLayout(d.mirroredSiteLayout)
    return data
  }
  try {
    const site = await req.payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
    })
    d.mirroredSiteLayout = normalizeMirroredSiteLayout(
      (site as { siteLayout?: unknown }).siteLayout,
    )
  } catch {
    d.mirroredSiteLayout = 'template1'
  }
  return data
}

/**
 * When a site's layout changes, refresh all「设计」rows that reference this site via `site`.
 */
export const syncBlueprintsMirroredLayoutAfterSiteChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation === 'delete') return

  const curr = doc as { id: string | number; siteLayout?: unknown }
  const prev = previousDoc as { siteLayout?: unknown } | undefined

  const nextLayout = normalizeMirroredSiteLayout(curr.siteLayout)
  if (operation === 'update' && previousDoc) {
    const prevLayout = normalizeMirroredSiteLayout(prev?.siteLayout)
    if (prevLayout === nextLayout) return
  }

  const siteId = curr.id
  const res = await req.payload.find({
    collection: 'site-blueprints',
    where: { site: { equals: siteId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })

  for (const bp of res.docs) {
    const row = bp as { id: string | number; mirroredSiteLayout?: unknown }
    if (normalizeMirroredSiteLayout(row.mirroredSiteLayout) === nextLayout) continue
    await req.payload.update({
      collection: 'site-blueprints',
      id: row.id,
      data: { mirroredSiteLayout: nextLayout },
      overrideAccess: true,
    })
  }
}
