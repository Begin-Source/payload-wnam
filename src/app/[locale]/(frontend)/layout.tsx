import { Inter, Merriweather, Noto_Sans_SC } from 'next/font/google'
import type { Metadata } from 'next'
import { headers } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { BlogHeader } from '@/components/blog/BlogHeader'
import { ReviewHubFooter } from '@/components/blog/reviewHub/ReviewHubFooter'
import { ReviewHubHeader } from '@/components/blog/reviewHub/ReviewHubHeader'
import { Template1Footer } from '@/components/template1/Template1Footer'
import { Template1Header } from '@/components/template1/Template1Header'
import config from '@/payload.config'
import { htmlLangForLocale, isAppLocale } from '@/i18n/config'
import type { AppLocale } from '@/i18n/config'
import {
  applyTemplate1Placeholders,
  template1BlockForLocale,
} from '@/utilities/publicLandingTemplate1'
import { AmzChrome } from '@/amz-template-1/AmzChrome'
import {
  getPublicSiteContext,
  getPublicSiteTheme,
  isAmzTemplateLayout,
  isTemplateShellLayout,
} from '@/utilities/publicLandingTheme'
import { getNavCategoriesForSite } from '@/utilities/publicSiteQueries'
import { resolveT1NavAboutLabel, resolveT1NavContactLabel } from '@/utilities/template1NavLabels'
import type { Site } from '@/payload-types'

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

function siteInitials(name: string): string {
  const t = name.trim()
  if (!t) return '·'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase()
  }
  return t.slice(0, 2).toUpperCase()
}

async function buildT1CompanyLinks(
  locale: AppLocale,
  site: Site | null,
  theme: Awaited<ReturnType<typeof getPublicSiteTheme>>,
): Promise<{ label: string; href: string }[]> {
  if (theme.footerResourceLinks.length > 0) {
    return theme.footerResourceLinks
  }
  const base = `/${locale}`
  const t1b = template1BlockForLocale(theme.template1, locale)
  const aboutL =
    site != null
      ? await resolveT1NavAboutLabel(
          site.id,
          locale,
          theme.template1.t1NavUsePageTitleForAbout,
          t1b.navAbout,
        )
      : t1b.navAbout
  const contactL =
    site != null
      ? await resolveT1NavContactLabel(
          site.id,
          locale,
          theme.template1.t1NavUsePageTitleForContact,
          t1b.navContact,
        )
      : t1b.navContact
  return [
    { label: aboutL, href: `${base}/about` },
    { label: contactL, href: `${base}/contact` },
    { label: t1b.navPrivacy, href: `${base}/privacy` },
  ]
}

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const theme = await getPublicSiteTheme(headersList)
  return {
    title: theme.browserTitle,
    description: theme.tagline,
  }
}

export default async function LocaleFrontendLayout(props: LayoutProps) {
  const { children, params } = props
  const { locale: localeParam } = await params
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam

  const headersList = await headers()
  const payloadConfig = await config
  const { site, theme } = await getPublicSiteContext(headersList)
  const isAmz = isAmzTemplateLayout(theme.siteLayout)
  const catLimit =
    theme.siteLayout === 'affiliate_reviews'
      ? 48
      : isTemplateShellLayout(theme.siteLayout)
        ? 24
        : isAmz
          ? 24
          : 8
  const categories = site ? await getNavCategoriesForSite(site.id, catLimit) : []

  // AMZ uses Tailwind `bg-background text-foreground` from amz-globals. Do not pass inline styles with
  // empty bg/color — that would expose ./styles.css `html { background: #000 }` through a transparent body.
  let bodyStyle: React.CSSProperties | undefined
  if (isAmz) {
    bodyStyle = undefined
  } else {
    bodyStyle = {
      backgroundColor: theme.blogContentBgColor,
      color: theme.blogBodyColor,
    }
    if (isTemplateShellLayout(theme.siteLayout)) {
      bodyStyle.backgroundColor = theme.blogContentBgColor
      bodyStyle.color = theme.blogBodyColor
    } else if (theme.fontPreset === 'serif') {
      bodyStyle.fontFamily = 'Georgia, "Times New Roman", serif'
    } else if (theme.fontPreset === 'system') {
      bodyStyle.fontFamily = 'system-ui, sans-serif'
    }
  }

  const htmlStyle = (
    isAmz
      ? {}
      : {
          backgroundColor: theme.blogContentBgColor,
          '--landing-bg': theme.bgColor,
          '--landing-text': theme.textColor,
          '--landing-muted': theme.mutedColor,
          '--landing-cta-bg': theme.ctaBgColor,
          '--landing-cta-text': theme.ctaTextColor,
          '--blog-primary': theme.blogPrimaryColor,
          '--blog-accent': theme.blogAccentColor,
          '--blog-card-bg': theme.blogCardBgColor,
          '--blog-header-text': theme.blogHeaderTextColor,
          '--blog-heading': theme.blogHeadingColor,
          '--blog-body': theme.blogBodyColor,
          '--blog-muted': 'rgba(0,0,0,0.45)',
          ...(isTemplateShellLayout(theme.siteLayout)
            ? ({
                '--primary': theme.blogPrimaryColor,
                '--primary-foreground': '#ffffff',
                '--background': theme.blogContentBgColor,
                '--foreground': theme.blogHeadingColor,
                '--card': theme.blogCardBgColor,
                '--muted-foreground': theme.blogBodyColor,
                '--border': 'oklch(0.9 0.005 95)',
              } as React.CSSProperties)
            : {}),
        }
  ) as React.CSSProperties

  const tShell = isTemplateShellLayout(theme.siteLayout)
  const bodyClassName = [
    isAmz ? 'min-h-screen antialiased' : undefined,
    !isAmz && tShell ? `${inter.className} antialiased` : undefined,
    theme.fontPreset === 'noto_sans_sc' && !tShell && !isAmz ? notoSansSc.className : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  const htmlClassName = [
    isAmz ? 'amz-template-1-root' : undefined,
    !isAmz && tShell
      ? theme.siteLayout === 'template2'
        ? `${inter.variable} ${merriweather.variable} template2-root`
        : `${inter.variable} ${merriweather.variable} template1-root`
      : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  const isTemplateShell = tShell
  let t1HeaderLabels: {
    allReviews: string
    categories: string
    about: string
    searchSr: string
    menuSr: string
  } | null = null
  let t1FooterLabels: {
    categoriesHeading: string
    companyHeading: string
    affiliateDisclosure: string
    copyrightLine: string
    bottomLine: string
  } | null = null
  let t1CompanyLinks: { label: string; href: string }[] = []
  if (isTemplateShell) {
    const t1b = template1BlockForLocale(theme.template1, locale)
    const aboutNav =
      site != null
        ? await resolveT1NavAboutLabel(
            site.id,
            locale,
            theme.template1.t1NavUsePageTitleForAbout,
            t1b.navAbout,
          )
        : t1b.navAbout
    const year = new Date().getFullYear()
    t1HeaderLabels = {
      allReviews: t1b.navAllReviews,
      categories: t1b.navCategories,
      about: aboutNav,
      searchSr: t1b.navSearchSr,
      menuSr: t1b.navMenuSr,
    }
    t1FooterLabels = {
      categoriesHeading: t1b.footerCategoriesHeading,
      companyHeading: t1b.footerCompanyHeading,
      affiliateDisclosure: t1b.footerAffiliateLabel,
      copyrightLine: applyTemplate1Placeholders(t1b.footerCopyright, {
        year,
        siteName: theme.siteName,
      }),
      bottomLine: t1b.footerBottom,
    }
    t1CompanyLinks = await buildT1CompanyLinks(locale, site, theme)
  }

  return (
    <html lang={htmlLangForLocale(locale)} className={htmlClassName || undefined} style={htmlStyle}>
      <body className={bodyClassName || undefined} style={bodyStyle}>
        {isAmz && theme.amzSiteConfig ? (
          <AmzChrome locale={locale} config={theme.amzSiteConfig}>
            {children}
          </AmzChrome>
        ) : isTemplateShell && t1HeaderLabels && t1FooterLabels ? (
          <>
            <Template1Header
              locale={locale}
              siteName={theme.siteName}
              siteInitials={siteInitials(theme.siteName)}
              categories={categories}
              labels={t1HeaderLabels}
            />
            <main>{children}</main>
            <Template1Footer
              locale={locale}
              theme={theme}
              categories={categories}
              labels={t1FooterLabels}
              companyLinks={t1CompanyLinks}
            />
          </>
        ) : theme.siteLayout === 'affiliate_reviews' ? (
          <div
            className={
              theme.siteLayout === 'default' ? 'blogShell' : `blogShell blogShell--${theme.siteLayout}`
            }
          >
            <ReviewHubHeader
              adminHref={payloadConfig.routes.admin}
              categories={categories}
              locale={locale}
              theme={theme}
            />
            <main className="blogMain">{children}</main>
            <ReviewHubFooter categories={categories} locale={locale} theme={theme} />
          </div>
        ) : (
          <div
            className={
              theme.siteLayout === 'default' ? 'blogShell' : `blogShell blogShell--${theme.siteLayout}`
            }
          >
            <BlogHeader
              adminHref={payloadConfig.routes.admin}
              categories={categories}
              locale={locale}
              theme={theme}
            />
            <main className="blogMain">{children}</main>
            {theme.footerLine ? (
              <footer className="blogFooter">
                <p>{theme.footerLine}</p>
              </footer>
            ) : null}
          </div>
        )}
      </body>
    </html>
  )
}
