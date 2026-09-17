import type { CollectionBeforeValidateHook, PayloadRequest, Where } from 'payload'
import { requireLocalSiteId } from './context'
import { parseRelationshipId } from '../utilities/parseRelationshipId'

/** The local tenant projection is selected by provisioning, never by the
 * browser principal's legacy organization roles or a submitted tenant ID. */
export async function localMasterTenant(req: PayloadRequest): Promise<number> {
  const site = await req.payload.findByID({ collection: 'sites', id: requireLocalSiteId(), depth: 0, overrideAccess: true, req })
  const tenant = parseRelationshipId(site.tenant)
  if (!Number.isSafeInteger(tenant) || tenant! < 1) throw new Error('Provisioned site tenant required')
  return tenant!
}

export const validateMasterTenant: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const tenant = await localMasterTenant(req)
  const supplied = data?.tenant ?? originalDoc?.tenant
  if ((supplied != null && parseRelationshipId(supplied) !== tenant) ||
    (originalDoc?.tenant != null && parseRelationshipId(originalDoc.tenant) !== tenant)) throw new Error('Cross-tenant site master rejected')
  return { ...data, tenant }
}

export async function masterTenantWhere(req: PayloadRequest): Promise<Where> {
  return { tenant: { equals: await localMasterTenant(req) } }
}
