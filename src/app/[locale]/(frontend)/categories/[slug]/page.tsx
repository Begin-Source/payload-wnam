import { headers } from 'next/headers.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { AboutSidebar } from '@/components/blog/AboutSidebar'
import { PostList } from '@/components/blog/PostList'
import { AmzCategoryPage } from '@/components/amz-template-1/AmzCategoryPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzTemplateLayout } from '@/utilities/publicLandingTheme'
import {
  getCategoryBySlugForSite,
  getOffersForCategory,
  getPublishedArticlesForSiteAndCategory,
} from '@/utilities/publicSiteQueries'

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale: loc, slug: raw } = await props.params
  if (!isAppLocale(loc)) return { title: 'Not found' }
  const slug = decodeURIComponent(raw)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) return { title: theme.browserTitle }
  const category = await getCategoryBySlugForSite(site.id, slug)
  if (!category) return { title: theme.browserTitle }
  return { title: `${category.name} · ${theme.siteName}` }
}

export default async function CategoryPage(props: Props) {
  const { locale: loc, slug: raw } = await props.params
  if (!isAppLocale(loc)) notFound()
  const locale = loc
  const slug = decodeURIComponent(raw)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) notFound()
  const category = await getCategoryBySlugForSite(site.id, slug)
  if (!category) notFound()
  const [articles, offers] = await Promise.all([
    getPublishedArticlesForSiteAndCategory(site.id, category.id, locale),
    getOffersForCategory(site.id, category.id, 24),
  ])

  if (isAmzTemplateLayout(theme.siteLayout) && theme.amzSiteConfig) {
    return (
      <AmzCategoryPage
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
