import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category, Offer } from '@/payload-types'

import { AmzArticleCards } from './AmzArticleCards'
import { AmzOfferCard } from './AmzOfferCard'

export function AmzCategoryPage({
  locale,
  config,
  category,
  articles,
  offers,
}: {
  locale: AppLocale
  config: AmzSiteConfig
  category: Category
  articles: Article[]
  /** Offers tagged with this category in CMS */
  offers?: Offer[]
}) {
  const p = config.pages.products
  const h1Lead = (p.categoryH1Lead ?? '').trim()
  const h1Suffix = (p.categoryH1Suffix ?? '').trim()
  const h1 = `${h1Lead ? `${h1Lead} ` : ''}${category.name}${h1Suffix ? ` ${h1Suffix}` : ''}`

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-center text-balance text-3xl font-bold text-foreground md:text-4xl">{h1}</h1>

      <AmzArticleCards articles={articles} locale={locale} />

      {offers && offers.length > 0 ? (
        <section className="mt-16">
          <header className="mx-auto max-w-3xl text-center">
            <h2 className="text-xl font-semibold text-foreground md:text-2xl">
              Featured products in this category
            </h2>
          </header>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <li key={o.id}>
                <AmzOfferCard offer={o} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-16 rounded-lg border border-border bg-muted/40 p-8 text-center">
        <h2 className="text-xl font-semibold text-foreground">{p.categoryBrowseOtherTitle}</h2>
        <p className="mt-2 text-muted-foreground">{p.categoryBrowseOtherDescription}</p>
        <AmzLink
          href={`/${locale}/reviews`}
          className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
        >
          Browse reviews →
        </AmzLink>
      </section>
    </div>
  )
}
