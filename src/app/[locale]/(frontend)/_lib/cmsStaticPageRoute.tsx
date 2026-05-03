import { headers } from 'next/headers.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AmzStaticPage as Amz1StaticPage } from '@/site-layouts/amz-template-1/pages/AmzStaticPage'
import { AmzStaticPage as Amz2StaticPage } from '@/site-layouts/amz-template-2/pages/AmzStaticPage'
import {
  hreflangTagForLocale,
  hreflangXDefaultUrl,
  isAppLocale,
  type AppLocale,
} from '@/i18n/config'
import { getPublicBaseUrlFromHeaders, seoMetaForDocument } from '@/utilities/seoDocumentMeta'
import { getPublicSiteContext, isAmzSiteLayout, isAmzTemplate2Layout } from '@/utilities/publicLandingTheme'
import { getPageBySlugForSite } from '@/utilities/publicSiteQueries'
import { lexicalStateToHtml } from '@/utilities/lexicalToHtml'

/** `root`: /[locale]/[slug] (e.g. about, contact, privacy). `nested`: /[locale]/pages/[slug]. */
export type CmsStaticPageLocation = 'root' | 'nested'

export async function generateCmsStaticPageMetadata(input: {
  locale: string
  cmsSlug: string
  location: CmsStaticPageLocation
}): Promise<Metadata> {
  if (!isAppLocale(input.locale)) return { title: 'Not found' }
  const locale = input.locale as AppLocale
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) return { title: theme.browserTitle }
  const page = await getPageBySlugForSite(site.id, input.cmsSlug, locale)
  if (!page) return { title: theme.browserTitle }
  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  const enc = encodeURIComponent(input.cmsSlug)

  const alternateLanguages: Record<string, string> = {}
  const base = baseUrl.replace(/\/$/, '')
  const hasByLocale: Partial<Record<AppLocale, boolean>> = {}

  for (const loc of theme.publicLocales) {
    const p = await getPageBySlugForSite(site.id, input.cmsSlug, loc)
    if (!p) continue
    hasByLocale[loc] = true
    const pathLoc =
      input.location === 'root' ? `${base}/${loc}/${enc}` : `${base}/${loc}/pages/${enc}`
    alternateLanguages[hreflangTagForLocale(loc)] = pathLoc
  }

  const pathForXDefault =
    input.location === 'root' ? enc : `pages/${enc}`
  const xDefault = hreflangXDefaultUrl(
    baseUrl,
    pathForXDefault,
    hasByLocale,
    theme.defaultPublicLocale,
  )
  if (xDefault) alternateLanguages['x-default'] = xDefault

  const path =
    input.location === 'root' ? `/${locale}/${enc}` : `/${locale}/pages/${enc}`

  return seoMetaForDocument(page, {
    siteName: theme.siteName,
    fallbackTitle: theme.browserTitle,
    path,
    baseUrl,
    alternateLanguages,
  })
}

export async function CmsStaticPageArticle(input: { locale: string; cmsSlug: string }) {
  if (!isAppLocale(input.locale)) notFound()
  const locale = input.locale as AppLocale
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) notFound()
  const page = await getPageBySlugForSite(site.id, input.cmsSlug, locale)
  if (!page) notFound()
  const html = lexicalStateToHtml(page.body)

  if (theme.amzSiteConfig && isAmzSiteLayout(theme.siteLayout)) {
    const StaticCmp = isAmzTemplate2Layout(theme.siteLayout) ? Amz2StaticPage : Amz1StaticPage
    return <StaticCmp title={page.title} html={html} />
  }

  return (
    <article className="blogArticle">
      <h1>{page.title}</h1>
      <div className="blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
