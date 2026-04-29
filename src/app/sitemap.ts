import type { MetadataRoute } from 'next'
import { headers } from 'next/headers.js'
import { getPayload } from 'payload'

import { locales, type AppLocale } from '@/i18n/config'
import config from '@/payload.config'
import type { Article, Category, Page } from '@/payload-types'
import { getPublicSiteContext, isAmzTemplateLayout } from '@/utilities/publicLandingTheme'
import { getPublicBaseUrlFromHeaders } from '@/utilities/seoDocumentMeta'
import {
  hreflangAlternatesForLocales,
  isSeoNoindexFromMeta,
  payloadFindAllForSitemap,
  STATIC_SITEMAP_SEGMENTS,
} from '@/utilities/sitemapHelpers'

function dateMax(...dates: (Date | null | undefined)[]): Date {
  let out = new Date(0)
  for (const d of dates) {
    if (d != null && d.getTime() > out.getTime()) out = d
  }
  return out
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  if (!site || !baseUrl) return []

  const siteLastModified = new Date(site.updatedAt ?? Date.now())
  const payload = await getPayload({ config: await config })
  const siteId = site.id

  const [articleDocs, pageDocs, categoryDocs] = await Promise.all([
    payloadFindAllForSitemap<Article>(payload, 'articles', {
      and: [
        { site: { equals: siteId } },
        { status: { equals: 'published' } },
        { mergedInto: { exists: false } },
      ],
    }),
    payloadFindAllForSitemap<Page>(payload, 'pages', {
      and: [{ site: { equals: siteId } }, { status: { equals: 'published' } }],
    }),
    payloadFindAllForSitemap<Category>(payload, 'categories', {
      and: [
        { site: { equals: siteId } },
        {
          or: [
            { categorySlotsWorkflowStatus: { equals: null } },
            { categorySlotsWorkflowStatus: { not_equals: 'running' } },
          ],
        },
      ],
    }),
  ])

  const latestFromArticles =
    articleDocs.length === 0
      ? undefined
      : new Date(Math.max(...articleDocs.map((a) => new Date(a.updatedAt).getTime())))
  const latestFromPages =
    pageDocs.length === 0
      ? undefined
      : new Date(Math.max(...pageDocs.map((p) => new Date(p.updatedAt).getTime())))
  const homeLastModified = dateMax(siteLastModified, latestFromArticles, latestFromPages)

  const entries: MetadataRoute.Sitemap = []

  const homeAlts = hreflangAlternatesForLocales((loc) => `${baseUrl}/${loc}/`)

  for (const locale of locales) {
    entries.push({
      url: `${baseUrl}/${locale}/`,
      lastModified: homeLastModified,
      changeFrequency: 'daily',
      priority: 1,
      alternates: homeAlts,
    })
  }

  for (const segment of STATIC_SITEMAP_SEGMENTS) {
    const alt = hreflangAlternatesForLocales((loc) => `${baseUrl}/${loc}/${segment}`)
    for (const locale of locales) {
      entries.push({
        url: `${baseUrl}/${locale}/${segment}`,
        lastModified: siteLastModified,
        changeFrequency: 'monthly',
        priority: segment === 'search' ? 0.65 : 0.7,
        alternates: alt,
      })
    }
  }

  const showAmzHub = isAmzTemplateLayout(theme.siteLayout) && Boolean(theme.amzSiteConfig)
  if (showAmzHub) {
    const hubSegments = ['products', 'reviews', 'guides'] as const
    for (const hub of hubSegments) {
      const hubAlt = hreflangAlternatesForLocales((loc) => `${baseUrl}/${loc}/${hub}`)
      for (const locale of locales) {
        entries.push({
          url: `${baseUrl}/${locale}/${hub}`,
          lastModified: siteLastModified,
          changeFrequency: 'weekly',
          priority: hub === 'products' ? 0.85 : 0.82,
          alternates: hubAlt,
        })
      }
    }
  }

  const articleBySlug = new Map<
    string,
    Partial<Record<AppLocale, Article>>
  >()

  for (const a of articleDocs) {
    if (isSeoNoindexFromMeta(a.meta)) continue
    const slug = a.slug?.trim()
    if (!slug) continue
    const locale = a.locale as AppLocale
    if (!locales.includes(locale)) continue

    let g = articleBySlug.get(slug)
    if (!g) {
      g = {}
      articleBySlug.set(slug, g)
    }
    g[locale] = a
  }

  for (const [slugKey, byLoc] of articleBySlug) {
    const slugEnc = encodeURIComponent(slugKey)
    const articleAlts = hreflangAlternatesForLocales(
      (loc) => `${baseUrl}/${loc}/posts/${slugEnc}`,
    )
    for (const locale of locales) {
      const a = byLoc[locale]
      if (!a?.slug?.trim()) continue
      entries.push({
        url: `${baseUrl}/${locale}/posts/${slugEnc}`,
        lastModified: new Date(a.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: articleAlts,
      })
    }
  }

  const pageBySlug = new Map<string, Partial<Record<AppLocale, Page>>>()
  for (const p of pageDocs) {
    if (isSeoNoindexFromMeta(p.meta)) continue
    const slug = p.slug?.trim()
    if (!slug) continue
    const locale = p.locale as AppLocale
    if (!locales.includes(locale)) continue
    let g = pageBySlug.get(slug)
    if (!g) {
      g = {}
      pageBySlug.set(slug, g)
    }
    g[locale] = p
  }

  for (const [pageSlugKey, byLoc] of pageBySlug) {
    const pageEnc = encodeURIComponent(pageSlugKey)
    const pageAlts = hreflangAlternatesForLocales((loc) => `${baseUrl}/${loc}/pages/${pageEnc}`)
    for (const locale of locales) {
      const p = byLoc[locale]
      if (!p?.slug?.trim()) continue
      entries.push({
        url: `${baseUrl}/${locale}/pages/${pageEnc}`,
        lastModified: new Date(p.updatedAt),
        changeFrequency: 'monthly',
        priority: 0.55,
        alternates: pageAlts,
      })
    }
  }

  for (const c of categoryDocs) {
    const slug = c.slug?.trim()
    if (!slug) continue
    const catAlt = hreflangAlternatesForLocales(
      (loc) => `${baseUrl}/${loc}/categories/${encodeURIComponent(slug)}`,
    )
    for (const locale of locales) {
      entries.push({
        url: `${baseUrl}/${locale}/categories/${encodeURIComponent(slug)}`,
        lastModified: new Date(c.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.55,
        alternates: catAlt,
      })
    }
  }

  return entries
}
