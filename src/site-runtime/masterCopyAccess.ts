import type { CollectionBeforeDeleteHook, CollectionBeforeValidateHook } from 'payload'

/** Copied templates are inert until an explicit CAS selection. Local templates
 * retain the previous create-and-use behavior, protected by a SQL unique index. */
export const validateActiveTemplate: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const merged = { ...originalDoc,...data }
  if (merged.masterEnabled === false) return data
  const result = await req.payload.find({ collection: 'tenant-prompt-templates',req,depth: 0,overrideAccess: true,limit: 1,
    where: { and: [{ tenant: { equals: merged.tenant } },{ key: { equals: merged.key } },
      { pipelineProfile: { equals: merged.pipelineProfile ?? null } },{ masterEnabled: { equals: true } },
      ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] } })
  if (result.docs.length) throw new Error('An active prompt already exists; select a replacement explicitly')
  return data
}

/** Keep stable local IDs usable by pinned dependencies and reviewed content. */
export const preventMasterCopyDeletion: CollectionBeforeDeleteHook = async ({ id,req,collection }) => {
  const doc = await req.payload.findByID({ collection: collection.slug as 'authors',id,depth: 0,req,overrideAccess: true }) as unknown as { centralSource?: { recordId?: string } }
  if (doc.centralSource?.recordId) throw new Error('Versioned master copies must be retired without deleting their identity')
}
