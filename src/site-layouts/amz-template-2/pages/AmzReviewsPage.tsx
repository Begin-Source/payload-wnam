import React from 'react'

import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'

import { AmzReviewsBrowseClient } from './AmzReviewsBrowseClient'

export function AmzReviewsPage({
  locale,
  config,
  articles,
  categories,
  activeCategorySlug,
  initialSearch = '',
}: {
  locale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  categories: Category[]
  activeCategorySlug?: string | null
  initialSearch?: string
}) {
  const r = config.pages.reviews
  const description = r.description.replace(/\{count\}/g, String(articles.length))

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto amz-page-x-gutter py-12 md:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-balance text-4xl font-bold text-foreground md:text-5xl">{r.title}</h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>
          </div>

          <AmzReviewsBrowseClient
            locale={locale}
            config={config}
            articles={articles}
            categories={categories}
            initialCategorySlug={activeCategorySlug ?? null}
            initialSearch={initialSearch}
          />
        </div>
      </div>
    </main>
  )
}
