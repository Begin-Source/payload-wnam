import { headers as getHeaders } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { AmzProductsPage as Amz1ProductsPage } from '@/site-layouts/amz-template-1/pages/AmzProductsPage'
import { AmzProductsPage as Amz2ProductsPage } from '@/site-layouts/amz-template-2/pages/AmzProductsPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzSiteLayout, isAmzTemplate2Layout } from '@/utilities/publicLandingTheme'
import { buildProductCountBySlug } from '@/utilities/amzOfferCategoryCounts'
import {
  getActiveOffersForSite,
  getCategoryBySlugForSite,
  getNavCategoriesForSite,
} from '@/utilities/publicSiteQueries'

/** Offer fetch limit for per-category counts on `/products` (avoid oversized payloads). */
const PRODUCT_INDEX_COUNT_OFFER_LIMIT = 400

/** Template-2 browse: uncategorized pool for client-side filter (`getActiveOffersForSite` caps at 200). */
const PRODUCT_BROWSE_OFFER_LIMIT = 200

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string | string[]; search?: string | string[] }>
}

export default async function ProductsPage(props: Props) {
  const { locale: localeParam } = await props.params
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam

  const sp = await props.searchParams
  const rawCat = sp.category
  const raw = (Array.isArray(rawCat) ? rawCat[0] : rawCat)?.trim() || ''
  const slug = raw ? decodeURIComponent(raw) : ''
  const rawSearch = sp.search
  const search = (Array.isArray(rawSearch) ? rawSearch[0] : rawSearch)?.trim() || ''

  const headers = await getHeaders()
  const { site, theme } = await getPublicSiteContext(headers)
  if (!site) notFound()
  if (!isAmzSiteLayout(theme.siteLayout) || !theme.amzSiteConfig) notFound()

  const t2 = isAmzTemplate2Layout(theme.siteLayout)

  if (t2) {
    const [categories, offersForCounts, offers] = await Promise.all([
      getNavCategoriesForSite(site.id, 48),
      getActiveOffersForSite(site.id, PRODUCT_INDEX_COUNT_OFFER_LIMIT),
      getActiveOffersForSite(site.id, PRODUCT_BROWSE_OFFER_LIMIT, null),
    ])
    const productCountBySlug = buildProductCountBySlug(categories, offersForCounts)
    return (
      <Amz2ProductsPage
        locale={locale}
        config={theme.amzSiteConfig}
        offers={offers}
        categories={categories}
        activeCategorySlug={slug || null}
        productCountBySlug={productCountBySlug}
        initialSearch={search}
      />
    )
  }

  const categoryDoc = slug ? await getCategoryBySlugForSite(site.id, slug) : null
  const categoryId = categoryDoc?.id

  const [categories, offersForCounts, offers] = await Promise.all([
    getNavCategoriesForSite(site.id, 48),
    getActiveOffersForSite(site.id, PRODUCT_INDEX_COUNT_OFFER_LIMIT),
    getActiveOffersForSite(site.id, 120, categoryId),
  ])
  const productCountBySlug = buildProductCountBySlug(categories, offersForCounts)

  return (
    <Amz1ProductsPage
      locale={locale}
      config={theme.amzSiteConfig}
      offers={offers}
      categories={categories}
      activeCategorySlug={slug || null}
      productCountBySlug={productCountBySlug}
    />
  )
}
