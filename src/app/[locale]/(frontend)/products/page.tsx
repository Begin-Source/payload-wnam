import { headers as getHeaders } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { AmzProductsPage } from '@/components/amz-template-1/AmzProductsPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzTemplateLayout } from '@/utilities/publicLandingTheme'
import { buildProductCountBySlug } from '@/utilities/amzOfferCategoryCounts'
import {
  getActiveOffersForSite,
  getCategoryBySlugForSite,
  getNavCategoriesForSite,
} from '@/utilities/publicSiteQueries'

/** Offer fetch limit for per-category counts on `/products` (avoid oversized payloads). */
const PRODUCT_INDEX_COUNT_OFFER_LIMIT = 400

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string | string[] }>
}

export default async function ProductsPage(props: Props) {
  const { locale: localeParam } = await props.params
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam

  const sp = await props.searchParams
  const rawCat = sp.category
  const raw = (Array.isArray(rawCat) ? rawCat[0] : rawCat)?.trim() || ''
  const slug = raw ? decodeURIComponent(raw) : ''

  const headers = await getHeaders()
  const { site, theme } = await getPublicSiteContext(headers)
  if (!site) notFound()
  if (!isAmzTemplateLayout(theme.siteLayout) || !theme.amzSiteConfig) notFound()

  const categoryDoc = slug ? await getCategoryBySlugForSite(site.id, slug) : null
  const categoryId = categoryDoc?.id

  const [offers, offersForCounts, categories] = await Promise.all([
    getActiveOffersForSite(site.id, 120, categoryId),
    getActiveOffersForSite(site.id, PRODUCT_INDEX_COUNT_OFFER_LIMIT),
    getNavCategoriesForSite(site.id, 48),
  ])

  const productCountBySlug = buildProductCountBySlug(categories, offersForCounts)

  return (
    <AmzProductsPage
      locale={locale}
      config={theme.amzSiteConfig}
      offers={offers}
      categories={categories}
      activeCategorySlug={slug || null}
      productCountBySlug={productCountBySlug}
    />
  )
}
