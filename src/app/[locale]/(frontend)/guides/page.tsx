import { headers as getHeaders } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { AmzGuidesPage } from '@/components/amz-template-1/AmzGuidesPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzTemplateLayout } from '@/utilities/publicLandingTheme'
import { getGuideCategoriesForSite, getPublishedArticlesForSite } from '@/utilities/publicSiteQueries'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string | string[] }>
}

export default async function GuidesPage(props: Props) {
  const { locale: localeParam } = await props.params
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam
  const sp = await props.searchParams
  const rawCat = sp.category
  const cat = (Array.isArray(rawCat) ? rawCat[0] : rawCat)?.trim() || ''

  const headers = await getHeaders()
  const { site, theme } = await getPublicSiteContext(headers)
  if (!site) notFound()
  if (!isAmzTemplateLayout(theme.siteLayout) || !theme.amzSiteConfig) notFound()

  const [articles, cmsGuideCategories] = await Promise.all([
    getPublishedArticlesForSite(site.id, locale, 96),
    getGuideCategoriesForSite(site.id, 24),
  ])

  return (
    <AmzGuidesPage
      locale={locale}
      config={theme.amzSiteConfig}
      articles={articles}
      activeSlug={cat || null}
      cmsGuideCategories={cmsGuideCategories}
    />
  )
}
