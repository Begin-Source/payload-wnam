import { headers as getHeaders } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { AmzReviewsPage as Amz1ReviewsPage } from '@/site-layouts/amz-template-1/pages/AmzReviewsPage'
import { AmzReviewsPage as Amz2ReviewsPage } from '@/site-layouts/amz-template-2/pages/AmzReviewsPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzSiteLayout, isAmzTemplate2Layout } from '@/utilities/publicLandingTheme'
import { getNavCategoriesForSite, getPublishedArticlesForReviewsListing } from '@/utilities/publicSiteQueries'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string | string[]; search?: string | string[] }>
}

export default async function ReviewsPage(props: Props) {
  const { locale: localeParam } = await props.params
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam
  const sp = await props.searchParams
  const rawCat = sp.category
  const cat = (Array.isArray(rawCat) ? rawCat[0] : rawCat)?.trim() || ''
  const rawSearch = sp.search
  const search = (Array.isArray(rawSearch) ? rawSearch[0] : rawSearch)?.trim() || ''

  const headers = await getHeaders()
  const { site, theme } = await getPublicSiteContext(headers)
  if (!site) notFound()
  if (!isAmzSiteLayout(theme.siteLayout) || !theme.amzSiteConfig) notFound()

  const t2 = isAmzTemplate2Layout(theme.siteLayout)
  const [articles, categories] = await Promise.all([
    getPublishedArticlesForReviewsListing(site.id, locale, 96),
    getNavCategoriesForSite(site.id, locale, 48),
  ])

  const shared = {
    locale,
    defaultPublicLocale: theme.defaultPublicLocale,
    config: theme.amzSiteConfig,
    articles,
    categories,
    activeCategorySlug: cat || null,
  } as const

  if (t2) {
    return <Amz2ReviewsPage {...shared} initialSearch={search} />
  }
  return <Amz1ReviewsPage {...shared} />
}
