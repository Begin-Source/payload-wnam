import type { Payload } from 'payload'

import type { Article, Offer } from '@/payload-types'
import type { ExtractedOfferReview } from '@/utilities/offerReviewMdx/extractOfferReviewMdx'
import { ensureReviewSlugWithAsin } from '@/utilities/offerReviewMdx/offerReviewSlug'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'

function firstSiteId(offer: Offer): number | null {
  const sites = offer.sites
  if (!Array.isArray(sites) || sites.length === 0) return null
  const s0 = sites[0]
  if (typeof s0 === 'number' && Number.isFinite(s0)) return s0
  if (s0 && typeof s0 === 'object' && 'id' in s0) return Number((s0 as { id: number }).id)
  return null
}

function categoryIdsForArticle(offer: Offer): number[] {
  const cats = offer.categories
  if (!Array.isArray(cats)) return []
  const out: number[] = []
  for (const c of cats) {
    if (typeof c === 'number' && Number.isFinite(c)) out.push(c)
    else if (c && typeof c === 'object' && 'id' in c) out.push(Number((c as { id: number }).id))
  }
  return out.filter((n) => Number.isFinite(n))
}

export type UpsertArticleFromReviewResult = {
  articleId: number
  created: boolean
}

/**
 * Create or update an `articles` row from extracted review + offer relations.
 */
export async function upsertArticleFromOfferReview(args: {
  payload: Payload
  offer: Offer
  extracted: ExtractedOfferReview
  reviewSlug: string
  locale?: string
}): Promise<UpsertArticleFromReviewResult> {
  const { payload, offer, extracted, reviewSlug } = args
  const locale = (args.locale || 'en').trim() || 'en'

  const siteId = firstSiteId(offer)
  if (siteId == null) {
    throw new Error('Offer has no linked site; link at least one site before creating an article.')
  }

  const slug = ensureReviewSlugWithAsin({
    title: extracted.meta.title,
    asin: extracted.meta.asin,
    existingReviewSlug: reviewSlug,
  })

  const body = markdownToPageBodyLexical(extracted.markdownBody) as Article['body']
  const categoryIds = categoryIdsForArticle(offer)

  const existing = await payload.find({
    collection: 'articles',
    where: {
      and: [{ site: { equals: siteId } }, { slug: { equals: slug } }, { locale: { equals: locale } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const baseData = {
    title: extracted.meta.title,
    slug,
    locale,
    site: siteId,
    status: 'draft' as const,
    excerpt: extracted.meta.description || undefined,
    body,
    relatedOffers: [offer.id],
    ...(categoryIds.length ? { categories: categoryIds } : {}),
  }

  const row = existing.docs[0] as Article | undefined
  if (row) {
    const updated = await payload.update({
      collection: 'articles',
      id: row.id,
      data: baseData,
      overrideAccess: true,
    })
    return { articleId: updated.id as number, created: false }
  }

  const created = await payload.create({
    collection: 'articles',
    data: baseData,
    overrideAccess: true,
  })
  return { articleId: created.id as number, created: true }
}
