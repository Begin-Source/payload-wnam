import type { CollectionBeforeValidateHook, Where } from 'payload'

function idFromRelation(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (typeof v === 'object' && v !== null && 'id' in v) {
    return idFromRelation((v as { id: unknown }).id)
  }
  return null
}

function siteIdsFromData(sites: unknown): number[] {
  if (!Array.isArray(sites)) return []
  const out: number[] = []
  for (const s of sites) {
    const id = idFromRelation(s)
    if (id != null) out.push(id)
  }
  return out
}

/**
 * Slug must be unique among authors that share any site with this doc (supports multi-site personas).
 */
export const authorsSitesSlugValidate: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const slug =
    typeof data?.slug === 'string'
      ? data.slug.trim()
      : typeof originalDoc?.slug === 'string'
        ? originalDoc.slug.trim()
        : ''
  if (!slug) return

  const siteIds = siteIdsFromData(data?.sites ?? originalDoc?.sites)
  if (siteIds.length === 0) return

  const selfId = data?.id ?? originalDoc?.id
  const overlapOr = siteIds.map((sid) => ({ sites: { contains: sid } }))

  const andCond: Where[] = [{ slug: { equals: slug } }]
  if (selfId != null) {
    andCond.push({ id: { not_equals: selfId } })
  }
  andCond.push({ or: overlapOr })

  const res = await req.payload.find({
    collection: 'authors',
    depth: 0,
    limit: 1,
    where: { and: andCond },
    req,
    overrideAccess: true,
  })

  if (res.docs.length > 0) {
    throw new Error(
      `Author slug "${slug}" is already used by another author assigned to one of these sites. Choose a different slug or adjust site assignments.`,
    )
  }
}
