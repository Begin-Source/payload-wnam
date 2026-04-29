import { headers as getHeaders } from 'next/headers.js'
import { notFound } from 'next/navigation'
import React from 'react'

import { AboutSidebar } from '@/components/blog/AboutSidebar'
import { ReviewHubHome } from '@/components/blog/reviewHub/ReviewHubHome'
import { PostList } from '@/components/blog/PostList'
import { AmzTemplateHomePage } from '@/components/amz-template-1/AmzTemplateHomePage'
import { Template1HomePage } from '@/components/template1/Template1HomePage'
import { isAppLocale } from '@/i18n/config'
import {
  getPublicSiteContext,
  isAmzTemplateLayout,
  isTemplateShellLayout,
} from '@/utilities/publicLandingTheme'
import {
  getFeaturedHomeOffersForSite,
  getNavCategoriesForSite,
  getPublishedArticlesForSite,
} from '@/utilities/publicSiteQueries'

type Props = { params: Promise<{ locale: string }> }

export default async function HomePage(props: Props) {
  const { locale: localeParam } = await props.params
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam

  const headers = await getHeaders()
  const { site, theme } = await getPublicSiteContext(headers)

  if (!site) {
    return (
      <div className="blogRow">
        <div>
          <h1 className="blogPageTitle">{theme.siteName}</h1>
          <p style={{ color: 'var(--blog-body)', lineHeight: 1.6 }}>
            No site resolved for this host. On localhost, open{' '}
            <code style={{ fontSize: '0.9em' }}>?site=your-site-slug</code> or set{' '}
            <code style={{ fontSize: '0.9em' }}>NEXT_PUBLIC_DEFAULT_SITE_SLUG</code>.
          </p>
        </div>
        <AboutSidebar theme={theme} />
      </div>
    )
  }

  const articles = await getPublishedArticlesForSite(site.id, locale, 20)

  if (isAmzTemplateLayout(theme.siteLayout) && theme.amzSiteConfig) {
    const [categories, featuredOffers] = await Promise.all([
      getNavCategoriesForSite(site.id, 32),
      getFeaturedHomeOffersForSite(site.id, 12),
    ])
    return (
      <AmzTemplateHomePage
        locale={locale}
        config={theme.amzSiteConfig}
        articles={articles}
        categories={categories}
        featuredOffers={featuredOffers}
      />
    )
  }

  if (isTemplateShellLayout(theme.siteLayout)) {
    const categories = await getNavCategoriesForSite(site.id, 32)
    return <Template1HomePage locale={locale} site={site} theme={theme} articles={articles} categories={categories} />
  }

  if (theme.siteLayout === 'affiliate_reviews') {
    const categories = await getNavCategoriesForSite(site.id, 48)
    return (
      <ReviewHubHome articles={articles} categories={categories} locale={locale} theme={theme} />
    )
  }

  return (
    <div className="blogRow">
      <div>
        <h1 className="blogPageTitle">Latest posts</h1>
        <PostList articles={articles} locale={locale} />
      </div>
      <AboutSidebar theme={theme} />
    </div>
  )
}
