import type { Payload, Where } from 'payload'

export type ListingCategoryKindStrict = 'review' | 'guide'

/** Sentinel: Payload article PKs are positive integers; `-1` never matches. */
const ARTICLE_LISTING_EMPTY_SENTINEL: Where = { id: { in: [-1] } }

/**
 * /reviews and /guides strict channel: articles must relate to at least one category
 * of `kind === 'review'` or `kind === 'guide'` respectively (same site scope).
 *
 * Empty `categoryIds` → no articles (explicit sentinel).
 */
export function buildStrictCategoryContainsWhere(categoryIds: readonly number[]): Where {
  const ids = categoryIds.filter(
    (id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0,
  )
  if (ids.length === 0) return ARTICLE_LISTING_EMPTY_SENTINEL
  const orBranches: Where[] = ids.map((id) => ({ categories: { contains: id } }))
  return { or: orBranches }
}

export async function getStrictListingArticlesWhereForCategoryKind(
  payload: Payload,
  siteId: number,
  kind: ListingCategoryKindStrict,
): Promise<Where> {
  const res = await payload.find({
    collection: 'categories',
    where: {
      and: [{ site: { equals: siteId } }, { kind: { equals: kind } }],
    },
    limit: 512,
    depth: 0,
    pagination: false,
    select: { id: true },
    overrideAccess: true,
  })
  const docs = res.docs as { id?: number }[]
  const ids = docs.map((d) => d.id).filter((id): id is number => typeof id === 'number' && id > 0)
  return buildStrictCategoryContainsWhere(ids)
}
