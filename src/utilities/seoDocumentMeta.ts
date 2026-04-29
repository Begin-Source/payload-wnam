import type { Metadata } from 'next'

import type { Media } from '@/payload-types'

export type SeoMetaDoc = {
  title?: string | null
  excerpt?: string | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: number | Media | null
  } | null
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

/**
 * Map Payload SEO plugin `meta` + document fallbacks to Next.js Metadata.
 */
export function seoMetaForDocument(
  doc: SeoMetaDoc,
  args: {
    siteName: string
    /** e.g. theme.browserTitle when document-specific title missing */
    fallbackTitle: string
    /** Public path for canonical, e.g. `/zh/posts/hello` */
    path: string
    baseUrl: string
    /** Optional hreflang map (BCP-47 keys, e.g. zh-CN, en, x-default). */
    alternateLanguages?: Record<string, string>
  },
): Metadata {
  const { siteName, fallbackTitle, path, baseUrl, alternateLanguages } = args
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

  const ogImage = metaImageUrl(meta)
  const ogImages = ogImage ? [{ url: ogImage }] : undefined

  return {
    title,
    description,
    alternates: {
      canonical,
      ...(alternateLanguages && Object.keys(alternateLanguages).length > 0
        ? { languages: alternateLanguages }
        : {}),
    },
    openGraph: {
      title: headline ?? siteName,
      description,
      url: canonical,
      ...(ogImages ? { images: ogImages } : {}),
    },
  }
}
