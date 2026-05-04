import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/site-layouts/amz-template-1/amzNavHref'
import { buildAmzCategoryCards } from './categoryCards'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'
import { AMZ_REVIEWS_ALL } from '@/utilities/amzBrowseUiStrings'
import { pickUiString } from '@/utilities/getLocalizedString'
import { resolveAmzReviewsHero } from '@/utilities/resolveAmzLocaleUi'

import { AmzArticleCards } from './AmzArticleCards'

export function AmzReviewsPage({
  locale,
  defaultPublicLocale,
  config,
  articles,
  categories,
  activeCategorySlug,
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  categories: Category[]
  activeCategorySlug?: string | null
}) {
  const chips = buildAmzCategoryCards(config, categories)

  const filtered =
    activeCategorySlug && chips.some((c) => c.slug === activeCategorySlug)
      ? articles.filter((a) => {
          const cats = a.categories ?? []
          return cats.some((c) => {
            const slug =
              typeof c === 'object' && c !== null && 'slug' in c ? (c as Category).slug : undefined
            return slug === activeCategorySlug
          })
        })
      : articles

  const { title, description } = resolveAmzReviewsHero(
    config,
    locale,
    defaultPublicLocale,
    filtered.length,
  )
  const p = (m: Partial<Record<AppLocale, string>>) =>
    pickUiString(locale, defaultPublicLocale, m)
  const allReviewsLabel = p(AMZ_REVIEWS_ALL)

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-balance text-4xl font-bold text-foreground md:text-5xl">{title}</h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>
          </div>

          {chips.length > 0 ? (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <AmzLink
                href={amzNavHref(locale, '/reviews')}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  !activeCategorySlug
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:border-primary'
                }`}
              >
                {allReviewsLabel}
              </AmzLink>
              {chips.map((c) => (
                <AmzLink
                  key={c.slug}
                  href={`${amzNavHref(locale, '/reviews')}?category=${encodeURIComponent(c.slug)}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    activeCategorySlug === c.slug
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary'
                  }`}
                >
                  {c.title}
                </AmzLink>
              ))}
            </div>
          ) : null}

          <div className="mt-10">
            <AmzArticleCards articles={filtered} locale={locale} />
          </div>
        </div>
      </div>
    </main>
  )
}
