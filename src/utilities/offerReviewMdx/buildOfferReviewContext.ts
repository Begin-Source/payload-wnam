import type { Offer } from '@/payload-types'

import { ensureReviewSlugWithAsin, slugify } from '@/utilities/offerReviewMdx/offerReviewSlug'

function dfsFeaturesFromSnapshot(dfs: unknown): string[] {
  if (!dfs || typeof dfs !== 'object') return []
  const d = dfs as Record<string, unknown>
  const out: string[] = []
  const desc = String(d.description ?? '').trim()
  if (desc) out.push(desc)
  const info = Array.isArray(d.product_information) ? d.product_information : []
  for (const section of info) {
    const sec = section as { body?: Record<string, unknown> }
    if (sec?.body && typeof sec.body === 'object') {
      for (const [k, val] of Object.entries(sec.body)) {
        const value = String(val ?? '').trim()
        if (!value) continue
        out.push(`${k}: ${value}`)
      }
    }
  }
  for (const key of ['functions', 'bullet_dominant', 'features'] as const) {
    const arr = d[key]
    if (Array.isArray(arr)) {
      for (const x of arr) {
        const s = String(x ?? '').trim()
        if (s) out.push(s)
      }
    }
  }
  return out.slice(0, 24)
}

function categoryLabelFromOffer(offer: Offer): string {
  const cats = offer.categories
  if (!Array.isArray(cats) || cats.length === 0) return ''
  const c0 = cats[0]
  if (c0 && typeof c0 === 'object' && 'name' in c0) {
    return String((c0 as { name?: string }).name ?? '').trim()
  }
  return ''
}

export type OfferReviewGenContext = {
  offerId: number
  title: string
  asin: string
  brand: string
  rating: number | ''
  imageUrl: string
  features: string[]
  category: string
  reviewSlug: string
  amazonUrl: string
  date: string
  affiliateTag: string
}

export function resolveAffiliateTag(): string {
  return (
    process.env.AMAZON_ASSOCIATE_TAG_DEFAULT?.trim() ||
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG?.trim() ||
    'smartymode-20'
  )
}

export function buildAmazonDpUrl(asin: string, tag: string): string {
  const a = String(asin || '')
    .trim()
    .toUpperCase()
  if (!a) return ''
  return `https://www.amazon.com/dp/${a}?tag=${encodeURIComponent(tag)}&linkCode=ogi&th=1&psc=1`
}

/**
 * Build LLM / extract context from a loaded Offer (depth≥1 for category names optional).
 */
export function buildOfferReviewGenContext(offer: Offer): OfferReviewGenContext {
  const amz = offer.amazon
  const dfs = amz?.dfsSnapshot
  const title = String(offer.title || '').trim()
  const asin = String(amz?.asin || '').trim()
  const ratingNum = amz?.ratingAvg
  const rating = typeof ratingNum === 'number' && Number.isFinite(ratingNum) ? ratingNum : ''

  let imageUrl = String(amz?.imageUrl || '').trim()
  if (!imageUrl && dfs && typeof dfs === 'object') {
    const url = (dfs as Record<string, unknown>).image_url
    if (typeof url === 'string' && url.trim()) imageUrl = url.trim()
  }

  let brand = ''
  if (dfs && typeof dfs === 'object') {
    const b = (dfs as Record<string, unknown>).brand
    if (typeof b === 'string' && b.trim()) brand = b.trim()
  }

  const featuresFromDfs = dfsFeaturesFromSnapshot(dfs ?? null)
  let features = featuresFromDfs
  if (features.length === 0 && amz?.merchantRaw && typeof amz.merchantRaw === 'object') {
    const mr = amz.merchantRaw as Record<string, unknown>
    const fe = mr.features
    if (Array.isArray(fe)) {
      features = fe.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 24)
    }
  }

  const category = categoryLabelFromOffer(offer) || slugify(title).replace(/-/g, ' ') || 'General'

  const affiliateTag = resolveAffiliateTag()
  const amazonUrl = buildAmazonDpUrl(asin, affiliateTag)
  const date = new Date().toISOString().slice(0, 10)

  const rd = offer.reviewDraft
  const existingSlug =
    rd && typeof rd === 'object' && rd !== null && 'slug' in rd
      ? String((rd as { slug?: string }).slug ?? '')
      : ''

  const reviewSlug = ensureReviewSlugWithAsin({
    title,
    asin,
    existingReviewSlug: existingSlug,
  })

  return {
    offerId: offer.id,
    title,
    asin,
    brand,
    rating,
    imageUrl,
    features,
    category,
    reviewSlug,
    amazonUrl,
    date,
    affiliateTag,
  }
}
