import { headers } from 'next/headers.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AmzStaticPage } from '@/components/amz-template-1/AmzStaticPage'
import { hreflangXDefaultUrl, isAppLocale, type AppLocale } from '@/i18n/config'
import { getPublicBaseUrlFromHeaders, seoMetaForDocument } from '@/utilities/seoDocumentMeta'
import { getPublicSiteContext, isAmzTemplateLayout } from '@/utilities/publicLandingTheme'
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

  const pZh = await getPageBySlugForSite(site.id, input.cmsSlug, 'zh')
  const pEn = await getPageBySlugForSite(site.id, input.cmsSlug, 'en')
  const alternateLanguages: Record<string, string> = {}
  const base = baseUrl.replace(/\/$/, '')

  const pathZh =
    input.location === 'root' ? `${base}/zh/${enc}` : `${base}/zh/pages/${enc}`
  const pathEn =
    input.location === 'root' ? `${base}/en/${enc}` : `${base}/en/pages/${enc}`

  if (pZh) alternateLanguages['zh-CN'] = pathZh
  if (pEn) alternateLanguages.en = pathEn

  const pathForXDefault =
    input.location === 'root' ? enc : `pages/${enc}`
  const xDefault = hreflangXDefaultUrl(baseUrl, pathForXDefault, Boolean(pZh), Boolean(pEn))
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

  if (theme.amzSiteConfig && isAmzTemplateLayout(theme.siteLayout)) {
    return <AmzStaticPage title={page.title} html={html} />
  }

  return (
    <article className="blogArticle">
      <h1>{page.title}</h1>
      <div className="blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
