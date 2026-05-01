import { headers } from 'next/headers.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AmzProductDetailPage } from '@/site-layouts/amz-template-2/pages/AmzProductDetailPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzSiteLayout } from '@/utilities/publicLandingTheme'
import { getActiveOfferByAsinForSite } from '@/utilities/publicSiteQueries'
import { getPublicBaseUrlFromHeaders } from '@/utilities/seoDocumentMeta'

type Props = { params: Promise<{ locale: string; asin: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale: loc, asin: rawAsin } = await props.params
  if (!isAppLocale(loc)) return { title: 'Not found' }
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site || !isAmzSiteLayout(theme.siteLayout) || !theme.amzSiteConfig) {
    return { title: theme.browserTitle }
  }
  const offer = await getActiveOfferByAsinForSite(site.id, decodeURIComponent(rawAsin))
  if (!offer) return { title: theme.browserTitle }
  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  const path = `/${loc}/product/${encodeURIComponent(rawAsin)}`
  const canonical = baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path
  return {
    title: `${offer.title} | ${theme.siteName}`,
    description: offer.title,
    alternates: { canonical },
    openGraph: {
      title: offer.title,
      type: 'website',
      url: canonical,
    },
  }
}

export default async function ProductAsinPage(props: Props) {
  const { locale: loc, asin: rawAsin } = await props.params
  if (!isAppLocale(loc)) notFound()
  const locale = loc
  const asin = decodeURIComponent(rawAsin)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) notFound()
  if (!isAmzSiteLayout(theme.siteLayout) || !theme.amzSiteConfig) notFound()

  const offer = await getActiveOfferByAsinForSite(site.id, asin)
  if (!offer) notFound()

  return <AmzProductDetailPage locale={locale} offer={offer} config={theme.amzSiteConfig} />
}
