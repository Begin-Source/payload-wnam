import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/amz-template-1/amzNavHref'
import { buildAmzCategoryCards } from '@/components/amz-template-1/categoryCards'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'

import { AmzArticleCards } from './AmzArticleCards'

export function AmzReviewsPage({
  locale,
  config,
  articles,
  categories,
  activeCategorySlug,
}: {
  locale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  categories: Category[]
  activeCategorySlug?: string | null
}) {
  const r = config.pages.reviews
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

  const description = r.description.replace(/\{count\}/g, String(filtered.length))

  return (
    <div className="container mx-auto px-4 py-10">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-balance text-3xl font-bold text-foreground md:text-4xl">{r.title}</h1>
        <p className="mt-4 text-balance text-muted-foreground">{description}</p>
      </header>

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
            All
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
  )
}
