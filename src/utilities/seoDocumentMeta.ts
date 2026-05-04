import type { Metadata } from 'next'

import type { Media } from '@/payload-types'
import { isSeoNoindexFromMeta } from '@/utilities/sitemapHelpers'

export type SeoMetaDoc = {
  title?: string | null
  excerpt?: string | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: number | Media | null
    noIndex?: boolean | null
    noindex?: boolean | null
    robots?: string | null
  } | null
}

export type SeoOpenGraphKind = 'article' | 'website'

export type SeoMetaForDocumentArgs = {
  siteName: string
  /** e.g. theme.browserTitle when document-specific title missing */
  fallbackTitle: string
  /** Public path for canonical, e.g. `/zh/posts/hello` */
  path: string
  baseUrl: string
  /** Optional hreflang map (BCP-47 keys, e.g. zh-CN, en, x-default). */
  alternateLanguages?: Record<string, string>
  /** Open Graph type; use `article` for blog posts with times. */
  openGraphKind?: SeoOpenGraphKind
  /** ISO strings for `article:published_time` / `article:modified_time` (Open Graph). */
  articleTimes?: { publishedTime?: string | null; modifiedTime?: string | null }
  /**
   * When set and there is no CMS meta image, used for `og:image` / Twitter image
   * (e.g. Amazon product image on `/product/[asin]`).
   */
  ogImageAbsoluteUrl?: string
}

/** Prefer `NEXT_PUBLIC_SITE_URL` in production; else derive from request headers. */
export function getPublicBaseUrlFromHeaders(headers: Headers): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? ''
  const proto = headers.get('x-forwarded-proto') ?? 'http'
  if (!host) return ''
  return `${proto}://${host}`
}

function metaImageUrl(meta: SeoMetaDoc['meta']): string | undefined {
  const img = meta?.image
  if (img != null && typeof img === 'object' && 'url' in img) {
    const u = (img as Media).url
    if (typeof u === 'string' && u) return u
  }
  return undefined
}

function toOgImageEntry(url: string): NonNullable<Metadata['openGraph']>['images'] {
  return [{ url }]
}

/**
 * Map Payload SEO plugin `meta` + document fallbacks to Next.js Metadata.
 * Uses the same noindex rules as the sitemap (`isSeoNoindexFromMeta`).
 */
export function seoMetaForDocument(doc: SeoMetaDoc, args: SeoMetaForDocumentArgs): Metadata {
  const {
    siteName,
    fallbackTitle,
    path,
    baseUrl,
    alternateLanguages,
    openGraphKind = 'website',
    articleTimes,
    ogImageAbsoluteUrl,
  } = args
  const meta = doc.meta
  const titleFromMeta = meta?.title?.trim()
  const titleFromDoc = doc.title?.trim()
  const headline = titleFromMeta || titleFromDoc
  const title: Metadata['title'] = headline ? `${headline} · ${siteName}` : `${fallbackTitle}`

  const description =
    meta?.description?.trim() || doc.excerpt?.trim() || undefined

  const pathNorm = path.startsWith('/') ? path : `/${path}`
  const base = baseUrl.replace(/\/$/, '')
  const canonical = `${base}${pathNorm}`

  const primaryOg = metaImageUrl(meta)
  const ogFromArg =
    typeof ogImageAbsoluteUrl === 'string' && ogImageAbsoluteUrl.trim()
      ? ogImageAbsoluteUrl.trim()
      : undefined
  const ogImageUrl = primaryOg ?? ogFromArg
  const ogImages = ogImageUrl ? toOgImageEntry(ogImageUrl) : undefined

  const noindex = isSeoNoindexFromMeta(meta)
  const robots: Metadata['robots'] = noindex
    ? { index: false, follow: false, googleBot: { index: false, follow: false } }
    : undefined

  const publishedTime =
    articleTimes?.publishedTime != null && String(articleTimes.publishedTime).trim()
      ? String(articleTimes.publishedTime)
      : undefined
  const modifiedTime =
    articleTimes?.modifiedTime != null && String(articleTimes.modifiedTime).trim()
      ? String(articleTimes.modifiedTime)
      : undefined

  const ogArticle =
    openGraphKind === 'article' && (publishedTime || modifiedTime)
      ? {
          publishedTime,
          modifiedTime,
        }
      : {}

  const twitterCard =
    ogImages && ogImages.length > 0 ? ('summary_large_image' as const) : ('summary' as const)

  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    alternates: {
      canonical,
      ...(alternateLanguages && Object.keys(alternateLanguages).length > 0
        ? { languages: alternateLanguages }
        : {}),
    },
    openGraph: {
      type: openGraphKind,
      title: headline ?? siteName,
      description,
      url: canonical,
      ...(ogImages ? { images: ogImages } : {}),
      ...(openGraphKind === 'article' ? ogArticle : {}),
    },
    twitter: {
      card: twitterCard,
      title: headline ?? siteName,
      ...(description ? { description } : {}),
      ...(ogImages ? { images: [ogImageUrl!] } : {}),
    },
  }
}
