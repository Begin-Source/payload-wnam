import { Inter, Merriweather, Noto_Sans_SC } from 'next/font/google'
import type { Metadata } from 'next'
import { headers } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import config from '@/payload.config'
import { htmlLangForLocale, isAppLocale } from '@/i18n/config'
import type { AppLocale } from '@/i18n/config'
import { resolveFrontendDocumentSurface } from '@/site-layouts/documentSurface'
import { getSiteLayoutShell } from '@/site-layouts/registry'
import { SiteLayoutErrorBoundary } from '@/site-layouts/SiteLayoutErrorBoundary'
import {
  getPublicSiteContext,
  getPublicSiteTheme,
  isAmzSiteLayout,
  isTemplateShellLayout,
} from '@/utilities/publicLandingTheme'
import { lucideBrandIconAbsoluteUrl, sanitizePascalLucideIconName } from '@/utilities/lucideIconSvg'
import { getNavCategoriesForSite } from '@/utilities/publicSiteQueries'

import '@/components/blog/blog.css'
import '@/components/blog/reviewHub/reviewHub.css'
import '@/styles/template1-globals.css'
import '@/styles/template2-globals.css'
import './styles.css'

const notoSansSc = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-merriweather',
  display: 'swap',
})

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const theme = await getPublicSiteTheme(headersList)
  const rasterIcon =
    typeof theme.siteLogoUrl === 'string' && theme.siteLogoUrl.trim()
      ? theme.siteLogoUrl.trim()
      : undefined

  const brandLogo = theme.amzSiteConfig?.brand.logo
  const sanitizedLucideIcon =
    isAmzSiteLayout(theme.siteLayout) &&
    rasterIcon == null &&
    brandLogo &&
    (brandLogo.type as string) === 'lucide'
      ? sanitizePascalLucideIconName(typeof brandLogo.icon === 'string' ? brandLogo.icon : '')
      : null

  const siteUrlRaw =
    typeof theme.amzSiteConfig?.seo?.siteUrl === 'string'
      ? theme.amzSiteConfig.seo.siteUrl.trim()
      : ''
  const lucideIconAbs = sanitizedLucideIcon ? lucideBrandIconAbsoluteUrl(siteUrlRaw) : null

  const iconForMeta = rasterIcon ?? lucideIconAbs ?? undefined

  return {
    title: theme.browserTitle,
    description: theme.tagline,
    ...(iconForMeta
      ? {
          icons: {
            icon: iconForMeta,
            apple: iconForMeta,
          },
        }
      : {}),
  }
}

export default async function LocaleFrontendLayout(props: LayoutProps) {
  const { children, params } = props
  const { locale: localeParam } = await params
  if (!isAppLocale(localeParam)) notFound()
  const locale: AppLocale = localeParam

  const headersList = await headers()
  const payloadConfig = await config
  const { site, theme } = await getPublicSiteContext(headersList)
  const isAmz = isAmzSiteLayout(theme.siteLayout)
  const catLimit =
    theme.siteLayout === 'affiliate_reviews'
      ? 48
      : isTemplateShellLayout(theme.siteLayout)
        ? 24
        : isAmz
          ? 24
          : 8
  const categories = site ? await getNavCategoriesForSite(site.id, catLimit) : []

  const surface = resolveFrontendDocumentSurface(theme, locale, {
    interClassName: inter.className,
    interVariable: inter.variable,
    merriweatherVariable: merriweather.variable,
    notoSansScClassName: notoSansSc.className,
  })

  const Shell = getSiteLayoutShell(theme.siteLayout)

  return (
    <html
      lang={htmlLangForLocale(locale)}
      className={surface.htmlClassName}
      style={surface.htmlStyle}
    >
      <body className={surface.bodyClassName} style={surface.bodyStyle}>
        <SiteLayoutErrorBoundary layoutId={theme.siteLayout}>
          <Shell
            adminHref={payloadConfig.routes.admin}
            categories={categories}
            locale={locale}
            site={site}
            theme={theme}
          >
            {children}
          </Shell>
        </SiteLayoutErrorBoundary>
      </body>
    </html>
  )
}
