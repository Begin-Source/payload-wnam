import { headers } from 'next/headers.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { AboutSidebar } from '@/components/blog/AboutSidebar'
import { PostList } from '@/components/blog/PostList'
import { AmzCategoryPage as Amz1CategoryPage } from '@/site-layouts/amz-template-1/pages/AmzCategoryPage'
import { AmzCategoryPage as Amz2CategoryPage } from '@/site-layouts/amz-template-2/pages/AmzCategoryPage'
import type { AppLocale } from '@/i18n/config'
import { hreflangTagForLocale, hreflangXDefaultUrl, isAppLocale } from '@/i18n/config'
import { getPublicBaseUrlFromHeaders, seoMetaForDocument } from '@/utilities/seoDocumentMeta'
import { getPublicSiteContext, isAmzSiteLayout, isAmzTemplate2Layout } from '@/utilities/publicLandingTheme'
import {
  getCategoryBySlugForSite,
  getOffersForCategory,
  getPublishedArticlesForSiteAndCategory,
} from '@/utilities/publicSiteQueries'

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale: loc, slug: raw } = await props.params
  if (!isAppLocale(loc)) return { title: 'Not found' }
  const locale = loc
  const slug = decodeURIComponent(raw)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) return { title: theme.browserTitle }
  const category = await getCategoryBySlugForSite(site.id, slug, locale)
  if (!category) return { title: theme.browserTitle }

  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  const enc = encodeURIComponent(slug)
  const alternateLanguages: Record<string, string> = {}
  const hasByLocale: Partial<Record<AppLocale, boolean>> = {}
  for (const outLoc of theme.publicLocales) {
    const c = await getCategoryBySlugForSite(site.id, slug, outLoc)
    if (c) {
      hasByLocale[outLoc] = true
      alternateLanguages[hreflangTagForLocale(outLoc)] = `${baseUrl}/${outLoc}/categories/${enc}`
    }
  }
  const xDefault = hreflangXDefaultUrl(
    baseUrl,
    `categories/${enc}`,
    hasByLocale,
    theme.defaultPublicLocale,
  )
  if (xDefault) alternateLanguages['x-default'] = xDefault

  return seoMetaForDocument(
    { title: category.name, excerpt: category.description },
    {
      siteName: theme.siteName,
      fallbackTitle: theme.browserTitle,
      path: `/${locale}/categories/${enc}`,
      baseUrl,
      alternateLanguages,
    },
  )
}

export default async function CategoryPage(props: Props) {
  const { locale: loc, slug: raw } = await props.params
  if (!isAppLocale(loc)) notFound()
  const locale = loc
  const slug = decodeURIComponent(raw)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) notFound()
  const category = await getCategoryBySlugForSite(site.id, slug, locale)
  if (!category) notFound()
  const [articles, offers] = await Promise.all([
    getPublishedArticlesForSiteAndCategory(site.id, category.id, locale),
    getOffersForCategory(site.id, category.id, 24),
  ])

  if (isAmzSiteLayout(theme.siteLayout) && theme.amzSiteConfig) {
    const CategoryCmp = isAmzTemplate2Layout(theme.siteLayout) ? Amz2CategoryPage : Amz1CategoryPage
    return (
      <CategoryCmp
        locale={locale}
        config={theme.amzSiteConfig}
        category={category}
        articles={articles}
        offers={offers}
      />
    )
  }

  return (
    <div className="blogRow">
      <div>
        <h1 className="blogPageTitle">{category.name}</h1>
        <PostList articles={articles} locale={locale} />
      </div>
      <AboutSidebar theme={theme} />
    </div>
  )
}
