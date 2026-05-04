import React from 'react'

import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'
import { resolveAmzReviewsHero } from '@/utilities/resolveAmzLocaleUi'

import { AmzReviewsBrowseClient } from './AmzReviewsBrowseClient'

export function AmzReviewsPage({
  locale,
  defaultPublicLocale,
  config,
  articles,
  categories,
  activeCategorySlug,
  initialSearch = '',
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  categories: Category[]
  activeCategorySlug?: string | null
  initialSearch?: string
}) {
  const { title, description } = resolveAmzReviewsHero(
    config,
    locale,
    defaultPublicLocale,
    articles.length,
  )

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto amz-page-x-gutter py-12 md:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex w-full flex-col items-center">
            <h1 className="mb-4 w-full text-balance text-center text-4xl font-bold text-foreground md:text-5xl">
              {title}
            </h1>
            <div className="w-full max-w-2xl">
              <p className="!text-center text-lg leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>

          <AmzReviewsBrowseClient
            locale={locale}
            defaultPublicLocale={defaultPublicLocale}
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
