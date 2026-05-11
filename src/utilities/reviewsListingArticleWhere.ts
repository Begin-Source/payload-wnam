import type { Payload, Where } from 'payload'

export type ListingCategoryKindStrict = 'review' | 'guide'

/** Sentinel: Payload article PKs are positive integers; `-1` never matches. */
const ARTICLE_LISTING_EMPTY_SENTINEL: Where = { id: { in: [-1] } }

/** Prefetch cap for mutual-exclusion IDs (guides vs reviews listing). Tune if sites exceed this volume. */
const EXCLUDE_ARTICLES_PREFETCH_LIMIT = 2000

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

/**
 * Channel listing: articles must relate to `includeCategoryIds`, and omit article PKs listed in
 * `excludeArticleIds` (resolved via prefetch — do not use `not` on relationship fields; D1 rejects
 * `not.categories`).
 */
export function buildListingWhereExcludingArticleIds(
  includeCategoryIds: readonly number[],
  excludeArticleIds: readonly number[],
): Where {
  const includeWhere = buildStrictCategoryContainsWhere(includeCategoryIds)
  const articleIds = Array.from(
    new Set(
      excludeArticleIds.filter(
        (id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0,
      ),
    ),
  )
  if (articleIds.length === 0) return includeWhere
  return { and: [includeWhere, { id: { not_in: articleIds } }] }
}

export async function getStrictListingArticlesWhereForCategoryKind(
  payload: Payload,
  siteId: number,
  kind: ListingCategoryKindStrict,
  locale: string,
): Promise<Where> {
  const res = await payload.find({
    collection: 'categories',
    where: {
      and: [
        { site: { equals: siteId } },
        { locale: { equals: locale } },
        { kind: { in: ['review', 'guide'] } },
      ],
    },
    limit: 512,
    depth: 0,
    pagination: false,
    select: { id: true, kind: true },
    overrideAccess: true,
  })
  const docs = res.docs as { id?: number; kind?: string | null }[]
  const filterIds = (k: ListingCategoryKindStrict) =>
    docs
      .filter((d) => d.kind === k)
      .map((d) => d.id)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  const opposite: ListingCategoryKindStrict = kind === 'review' ? 'guide' : 'review'

  const includeIds = filterIds(kind)
  const excludeCategoryIds = filterIds(opposite)

  if (excludeCategoryIds.length === 0) {
    return buildStrictCategoryContainsWhere(includeIds)
  }

  const orBranches: Where[] = excludeCategoryIds.map((id) => ({
    categories: { contains: id },
  }))

  const exRes = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { status: { equals: 'published' as const } },
        { site: { equals: siteId } },
        { locale: { equals: locale } },
        { or: orBranches },
      ],
    },
    limit: EXCLUDE_ARTICLES_PREFETCH_LIMIT,
    depth: 0,
    pagination: false,
    select: { id: true },
    overrideAccess: true,
  })

  const excludeArticleIds = (exRes.docs as { id?: number }[])
    .map((d) => d.id)
    .filter((id): id is number => typeof id === 'number' && id > 0)

  return buildListingWhereExcludingArticleIds(includeIds, excludeArticleIds)
}
