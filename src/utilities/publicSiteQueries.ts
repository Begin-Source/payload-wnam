import { cache } from 'react'

import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import type { Article, Author, Category, Media, Offer, Page } from '@/payload-types'

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
  description: true,
  kind: true,
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

/** Guides page chips: Payload categories with kind=guide for this site */
export const getGuideCategoriesForSite = cache(
  async (siteId: number, limit = 24): Promise<Category[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'categories',
      where: {
        and: [{ site: { equals: siteId } }, { kind: { equals: 'guide' } }],
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
  async (siteId: number, limit = 8): Promise<Category[]> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'categories',
      where: { site: { equals: siteId } },
      limit,
      sort: 'name',
      depth: 0,
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
  async (siteId: number, slug: string): Promise<Category | null> => {
    const payload = await getPayload({ config: await config })
    const res = await payload.find({
      collection: 'categories',
      where: {
        and: [{ site: { equals: siteId } }, { slug: { equals: slug } }],
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
    return docs
      .filter((o) => {
        const sites = o.sites
        if (sites == null) return true
        if (Array.isArray(sites) && sites.length === 0) return true
        return sites.some((s) => (typeof s === 'number' ? s : (s as { id?: number })?.id) === siteId)
      })
      .slice(0, cap)
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
