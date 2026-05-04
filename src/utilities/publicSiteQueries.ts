import { cache } from 'react'

import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import type { Article, Author, Category, Media, Offer, Page } from '@/payload-types'
import { getStrictListingArticlesWhereForCategoryKind } from '@/utilities/reviewsListingArticleWhere'

/**
 * Public article/page fetch — `select` shapes for `@payloadcms/db-d1-sqlite`.
 *
 * **Do not use `fieldName: false` inside `select` for this adapter:** it strips sibling
 * scalar fields on the same document (e.g. `title` / `body` come back empty). Omit relation
 * keys you do not need instead of setting them to `false`.
 *
 * Use **depth: 1** (not 2) where possible: at depth 2, populated `categories` may batch-load
 * heavy `sites` rows on D1 (`too many columns`). At depth 1, `Category.site` and `Media.site`
 * typically stay as IDs. Author `headshot` may be a media id; resolve with `mergeAuthorHeadshots`.
 */
const mediaPublicSelect = {
  alt: true,
  url: true,
  thumbnailURL: true,
  width: true,
  height: true,
  filename: true,
  mimeType: true,
  filesize: true,
} as const

const categoryPublicSelect = {
  id: true,
  name: true,
  slug: true,
  locale: true,
  description: true,
  kind: true,
  coverImage: mediaPublicSelect,
} as const

const authorPublicSelect = {
  id: true,
  displayName: true,
  slug: true,
  role: true,
  bioLexical: true,
  headshot: true,
} as const

const articlePublicSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  body: true,
  publishedAt: true,
  locale: true,
  status: true,
  featuredImage: mediaPublicSelect,
  author: authorPublicSelect,
  categories: categoryPublicSelect,
} as const

const offerPublicSelect = {
  id: true,
  title: true,
  slug: true,
  targetUrl: true,
  status: true,
  amazon: true,
  network: { id: true, name: true, slug: true },
  categories: categoryPublicSelect,
} as const

/** Detail route: includes SEO meta + affiliate layout + embedded offers for AMZ article page */
const articleDetailSelect = {
  ...articlePublicSelect,
  meta: true,
  affiliatePageLayout: true,
  relatedOffers: offerPublicSelect,
} as const

/** AMZ template-2 /reviews listing: articles + related offers (dual-CTA cards) without full detail fields */
const articleReviewsListSelect = {
  ...articlePublicSelect,
  relatedOffers: offerPublicSelect,
} as const

const pagePublicSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  body: true,
  publishedAt: true,
  locale: true,
  status: true,
  featuredImage: mediaPublicSelect,
  categories: categoryPublicSelect,
} as const

/** Depth-1 list leaves `author.headshot` as a media id; resolve without touching `sites`. */
async function mergeAuthorHeadshots(payload: Payload, articles: Article[]): Promise<void> {
  const ids = new Set<number>()
  for (const a of articles) {
    const auth = a.author
    if (auth && typeof auth === 'object' && 'headshot' in auth) {
      const h = (auth as Author).headshot
      if (typeof h === 'number') ids.add(h)
    }
  }
  if (ids.size === 0) return
  const idArr = Array.from(ids)
  const res = await payload.find({
    collection: 'media',
    where: { id: { in: idArr } },
    limit: idArr.length,
    depth: 0,
    pagination: false,
    select: mediaPublicSelect,
    overrideAccess: true,
  })
  const byId = new Map((res.docs as Media[]).map((m) => [m.id, m]))
  for (const a of articles) {
    const auth = a.author
    if (auth && typeof auth === 'object' && 'headshot' in auth) {
      const h = (auth as Author).headshot
      if (typeof h === 'number') {
        const m = byId.get(h)
        if (m) (auth as Author).headshot = m
      }
    }
  }
}

function offerAppliesToSite(offer: Offer, siteId: number): boolean {
  const sites = offer.sites
  if (sites == null) return true
  if (Array.isArray(sites) && sites.length === 0) return true
  return sites.some((s) => (typeof s === 'number' ? s : (s as { id?: number })?.id) === siteId)
}

/** Guides page chips: Payload categories with kind=guide for this site */
export const getGuideCategoriesForSite = cache(
  async (siteId: number, locale: string, limit = 24): Promise<Category[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'categories',
      where: {
        and: [
          { site: { equals: siteId } },
          { locale: { equals: locale } },
          { kind: { equals: 'guide' } },
        ],
      },
      limit,
      sort: 'name',
      depth: 0,
      select: categoryPublicSelect,
      overrideAccess: true,
    })
    return res.docs as Category[]
  },
)

export const getNavCategoriesForSite = cache(
  async (siteId: number, locale: string, limit = 8): Promise<Category[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'categories',
      where: {
        and: [{ site: { equals: siteId } }, { locale: { equals: locale } }],
      },
      limit,
      sort: 'name',
      depth: 1,
      overrideAccess: true,
    })
    return res.docs as Category[]
  },
)

export const getPublishedArticlesForSite = cache(
  async (siteId: number, locale: string, limit = 24): Promise<Article[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { status: { equals: 'published' } },
          { site: { equals: siteId } },
          { locale: { equals: locale } },
        ],
      },
      sort: '-publishedAt',
      limit,
      depth: 1,
      select: articlePublicSelect,
      overrideAccess: true,
    })
    const docs = res.docs as Article[]
    await mergeAuthorHeadshots(payload, docs)
    return docs
  },
)

/** Published articles for AMZ /reviews grid (includes `relatedOffers` for merchant CTA). */
export const getPublishedArticlesForReviewsListing = cache(
  async (siteId: number, locale: string, limit = 96): Promise<Article[]> => {
    const payload = await getPayload({ config: await config })
    const listingClause = await getStrictListingArticlesWhereForCategoryKind(
      payload,
      siteId,
      'review',
      locale,
    )
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { status: { equals: 'published' } },
          { site: { equals: siteId } },
          { locale: { equals: locale } },
          listingClause,
        ],
      },
      sort: '-publishedAt',
      limit,
      depth: 1,
      select: articleReviewsListSelect,
      overrideAccess: true,
    })
    const docs = res.docs as Article[]
    await mergeAuthorHeadshots(payload, docs)
    return docs
  },
)

/** Guides listing: articles must relate to at least one `kind === 'guide'` category for this site. */
export const getPublishedArticlesForGuidesListing = cache(
  async (siteId: number, locale: string, limit = 96): Promise<Article[]> => {
    const payload = await getPayload({ config: await config })
    const listingClause = await getStrictListingArticlesWhereForCategoryKind(
      payload,
      siteId,
      'guide',
      locale,
    )
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { status: { equals: 'published' } },
          { site: { equals: siteId } },
          { locale: { equals: locale } },
          listingClause,
        ],
      },
      sort: '-publishedAt',
      limit,
      depth: 1,
      select: articlePublicSelect,
      overrideAccess: true,
    })
    const docs = res.docs as Article[]
    await mergeAuthorHeadshots(payload, docs)
    return docs
  },
)

export const getPublishedArticlesForSiteAndCategory = cache(
  async (siteId: number, categoryId: number, locale: string, limit = 24): Promise<Article[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { status: { equals: 'published' } },
          { site: { equals: siteId } },
          { locale: { equals: locale } },
          { categories: { contains: categoryId } },
        ],
      },
      sort: '-publishedAt',
      limit,
      depth: 1,
      select: articlePublicSelect,
      overrideAccess: true,
    })
    const docs = res.docs as Article[]
    await mergeAuthorHeadshots(payload, docs)
    return docs
  },
)

export const getCategoryBySlugForSite = cache(
  async (siteId: number, slug: string, locale: string): Promise<Category | null> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'categories',
      where: {
        and: [
          { site: { equals: siteId } },
          { slug: { equals: slug } },
          { locale: { equals: locale } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return (res.docs[0] as Category | undefined) ?? null
  },
)

/**
 * Related posts: same site + locale, exclude current. Prefer any shared category, then
 * backfill with latest published on the same site.
 */
/**
 * Active offers scoped to site (sites empty/absent => all sites).
 * Optionally filter by a category relation (Offer.categories contains categoryId).
 * Args: `(siteId, limit = 120, categoryId?)` so existing `getActiveOffersForSite(id, 120)` stays valid.
 */
export const getActiveOffersForSite = cache(
  async (siteId: number, limit = 120, categoryId?: number | null): Promise<Offer[]> => {
    const payload = await getPayload({ config: await config })
    const andClauses = [
      { status: { equals: 'active' as const } },
      ...(categoryId != null && categoryId > 0
        ? [{ categories: { contains: categoryId } }]
        : []),
    ]
    const res = await payload.find({
      collection: 'offers',
      where: { and: andClauses },
      sort: 'title',
      limit: 500,
      depth: 1,
      select: offerPublicSelect,
      overrideAccess: true,
    })
    const docs = res.docs as Offer[]
    const cap = Math.min(limit, 200)
    return docs.filter((o) => offerAppliesToSite(o, siteId)).slice(0, cap)
  },
)

export const getOffersForCategory = cache(
  async (siteId: number, categoryId: number, limit = 24): Promise<Offer[]> => {
    return getActiveOffersForSite(siteId, limit, categoryId)
  },
)

/** Featured Products on home: active + featuredOnHomeForSites contains this site */
export const getFeaturedHomeOffersForSite = cache(
  async (siteId: number, limit = 12): Promise<Offer[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'offers',
      where: {
        and: [
          { status: { equals: 'active' } },
          { featuredOnHomeForSites: { contains: siteId } },
        ],
      },
      sort: 'title',
      limit: Math.min(limit, 48),
      depth: 1,
      select: offerPublicSelect,
      overrideAccess: true,
    })
    return res.docs as Offer[]
  },
)

/** Minimal article fields to map featured offers → review slug / excerpt (homepage Featured row). */
const featuredHomeArticleSelect = {
  slug: true,
  excerpt: true,
  relatedOffers: true,
} as const

export type FeaturedHomeRow = {
  offer: Offer
  reviewSlug: string | null
  excerpt: string | null
}

/**
 * Featured homepage offers plus optional linked review (`articles.relatedOffers` contains offer id).
 * First matching article per offer wins (articles sorted by `publishedAt` desc = newest first).
 */
export const getFeaturedHomeRowsForSite = cache(
  async (siteId: number, locale: string, limit = 12): Promise<FeaturedHomeRow[]> => {
    const offers = await getFeaturedHomeOffersForSite(siteId, limit)
    if (offers.length === 0) return []

    const payload = await getPayload({ config: await config })
    const offerIds = offers.map((o) => o.id).filter((id): id is number => typeof id === 'number')
    if (offerIds.length === 0) {
      return offers.map((o) => ({ offer: o, reviewSlug: null, excerpt: null }))
    }

    const orConds = offerIds.map((id) => ({ relatedOffers: { contains: id } }))
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { status: { equals: 'published' as const } },
          { site: { equals: siteId } },
          { locale: { equals: locale } },
          { or: orConds },
        ],
      },
      sort: '-publishedAt',
      limit: 100,
      depth: 0,
      select: featuredHomeArticleSelect,
      overrideAccess: true,
    })

    const byOfferId = new Map<number, { slug: string; excerpt: string | null }>()
    for (const doc of res.docs as Article[]) {
      const ro = doc.relatedOffers
      if (!ro || !Array.isArray(ro)) continue
      for (const ref of ro) {
        const oid = typeof ref === 'number' ? ref : (ref as Offer).id
        if (oid == null || !offerIds.includes(oid)) continue
        if (byOfferId.has(oid)) continue
        const slug = typeof doc.slug === 'string' && doc.slug.trim() ? doc.slug.trim() : ''
        if (!slug) continue
        const ex = doc.excerpt
        byOfferId.set(oid, {
          slug,
          excerpt: typeof ex === 'string' && ex.trim() ? ex.trim() : null,
        })
      }
    }

    return offers.map((offer) => {
      const row = byOfferId.get(offer.id)
      return {
        offer,
        reviewSlug: row?.slug ?? null,
        excerpt: row?.excerpt ?? null,
      }
    })
  },
)

export const getOffersByIds = cache(async (ids: number[]): Promise<Offer[]> => {
  if (ids.length === 0) return []
  const payload = await getPayload({ config: await config })
  const res = await payload.find({
    collection: 'offers',
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 1,
    select: offerPublicSelect,
    overrideAccess: true,
  })
  return res.docs as Offer[]
})

/** Active offer for this site whose `amazon.asin` matches (case-insensitive trim). */
export const getActiveOfferByAsinForSite = cache(
  async (siteId: number, asinRaw: string): Promise<Offer | null> => {
    const needle = asinRaw.trim().toUpperCase()
    if (!needle) return null
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'offers',
      where: {
        and: [{ status: { equals: 'active' as const } }, { 'amazon.asin': { equals: needle } }],
      },
      limit: 40,
      depth: 1,
      select: offerPublicSelect,
      overrideAccess: true,
    })
    for (const o of res.docs as Offer[]) {
      if (!offerAppliesToSite(o, siteId)) continue
      const a = o.amazon?.asin?.trim().toUpperCase()
      if (a === needle) return o
    }

    const resLoose = await payload.find({
      collection: 'offers',
      where: {
        and: [{ status: { equals: 'active' as const } }, { 'amazon.asin': { contains: needle } }],
      },
      limit: 40,
      depth: 1,
      select: offerPublicSelect,
      overrideAccess: true,
    })
    for (const o of resLoose.docs as Offer[]) {
      if (!offerAppliesToSite(o, siteId)) continue
      const a = o.amazon?.asin?.trim().toUpperCase()
      if (a === needle) return o
    }
    return null
  },
)

export const getRelatedArticlesForSite = cache(
  async (
    siteId: number,
    locale: string,
    args: { excludeId: number; categoryIds: number[]; limit?: number },
  ): Promise<Article[]> => {
    const limit = args.limit ?? 3
    const payload = await getPayload({ config: await config })
    const base = [
      { status: { equals: 'published' } },
      { site: { equals: siteId } },
      { locale: { equals: locale } },
      { id: { not_equals: args.excludeId } },
    ] as const

    const seen = new Set<number>([args.excludeId])
    const out: Article[] = []

    if (args.categoryIds.length > 0) {
      const orConds = args.categoryIds.map((id) => ({ categories: { contains: id } }))
      const res = await payload.find({
        collection: 'articles',
        where: { and: [...base, { or: orConds }] },
        sort: '-publishedAt',
        limit: 24,
        depth: 1,
        select: articlePublicSelect,
        overrideAccess: true,
      })
      for (const doc of res.docs as Article[]) {
        if (seen.has(doc.id)) continue
        seen.add(doc.id)
        out.push(doc)
        if (out.length >= limit) {
          await mergeAuthorHeadshots(payload, out)
          return out
        }
      }
    }

    const res2 = await payload.find({
      collection: 'articles',
      where: { and: [...base] },
      sort: '-publishedAt',
      limit: 24,
      depth: 1,
      select: articlePublicSelect,
      overrideAccess: true,
    })
    for (const doc of res2.docs as Article[]) {
      if (seen.has(doc.id)) continue
      seen.add(doc.id)
      out.push(doc)
      if (out.length >= limit) break
    }
    await mergeAuthorHeadshots(payload, out)
    return out
  },
)

export const getArticleBySlugForSite = cache(
  async (siteId: number, slug: string, locale: string): Promise<Article | null> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { status: { equals: 'published' } },
          { site: { equals: siteId } },
          { slug: { equals: slug } },
          { locale: { equals: locale } },
        ],
      },
      limit: 1,
      depth: 2,
      select: articleDetailSelect,
      overrideAccess: true,
    })
    const doc = (res.docs[0] as Article | undefined) ?? null
    if (doc) await mergeAuthorHeadshots(payload, [doc])
    return doc
  },
)

export const getPageBySlugForSite = cache(
  async (siteId: number, slug: string, locale: string): Promise<Page | null> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'pages',
      where: {
        and: [
          { status: { equals: 'published' } },
          { site: { equals: siteId } },
          { slug: { equals: slug } },
          { locale: { equals: locale } },
        ],
      },
      limit: 1,
      depth: 1,
      select: pagePublicSelect,
      overrideAccess: true,
    })
    return (res.docs[0] as Page | undefined) ?? null
  },
)
