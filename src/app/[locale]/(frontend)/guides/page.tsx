import { headers as getHeaders } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { AmzGuidesPage as Amz1GuidesPage } from '@/site-layouts/amz-template-1/pages/AmzGuidesPage'
import { AmzGuidesPage as Amz2GuidesPage } from '@/site-layouts/amz-template-2/pages/AmzGuidesPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzSiteLayout, isAmzTemplate2Layout } from '@/utilities/publicLandingTheme'
import { getGuideCategoriesForSite, getPublishedArticlesForSite } from '@/utilities/publicSiteQueries'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string | string[]; search?: string | string[] }>
}

export default async function GuidesPage(props: Props) {
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

  const [articles, cmsGuideCategories] = await Promise.all([
    getPublishedArticlesForSite(site.id, locale, 96),
    getGuideCategoriesForSite(site.id, 24),
  ])

  const shared = {
    locale,
    config: theme.amzSiteConfig,
    articles,
    activeSlug: cat || null,
    cmsGuideCategories,
  } as const

  if (isAmzTemplate2Layout(theme.siteLayout)) {
    return <Amz2GuidesPage {...shared} initialSearch={search} />
  }
  return <Amz1GuidesPage {...shared} />
}
