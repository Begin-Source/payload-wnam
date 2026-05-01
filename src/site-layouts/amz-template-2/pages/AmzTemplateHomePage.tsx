import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import { amzNavHref } from '@/site-layouts/amz-template-2/amzNavHref'
import type { AppLocale } from '@/i18n/config'
import type { Category } from '@/payload-types'
import type { FeaturedHomeRow } from '@/utilities/publicSiteQueries'

import { AmzCategoryBrowseGrid } from './AmzCategoryBrowseGrid'
import { buildAmzCategoryCards } from './categoryCards'
import { AmzFeaturedOfferCard } from './AmzFeaturedOfferCard'
import { AmzHomeCta } from './AmzHomeCta'
import { AmzTemplateHomeHero } from './AmzTemplateHomeHero'

export type AmzTemplateHomePageProps = {
  locale: AppLocale
  config: AmzSiteConfig
  categories: Category[]
  /** Homepage Featured — offers + optional review from `articles.relatedOffers` */
  featuredRows: FeaturedHomeRow[]
}

/**
 * Order and spacing match `amz-template-old/app/page.tsx`: hero → categories → featured (muted) → CTA.
 * Article lists are not on the reference homepage (reviews live under `/reviews`).
 */
export function AmzTemplateHomePage(props: AmzTemplateHomePageProps) {
  const { locale, config, categories, featuredRows } = props
  const featuredTitle = config.homepage.featuredProducts.title
  const featuredSubtitle = config.homepage.featuredProducts.subtitle
  const cta = config.homepage.cta
  const catTitle = config.homepage.categories.title
  const catSubtitle = config.homepage.categories.subtitle

  const categoryCards = buildAmzCategoryCards(config, categories)
  const featuredRow = featuredRows.slice(0, 5)

  return (
    <main className="flex-1">
      <AmzTemplateHomeHero locale={locale} config={config} />

      {categoryCards.length > 0 ? (
        <AmzCategoryBrowseGrid
          layoutVariant="home"
          cards={categoryCards}
          hrefForSlug={(slug) => `/${locale}/categories/${encodeURIComponent(slug)}`}
          sectionTitle={catTitle}
          sectionSubtitle={catSubtitle}
        />
      ) : null}

      {featuredRow.length > 0 ? (
        <section className="bg-muted/30 py-16 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="mb-2 text-balance text-3xl font-bold text-foreground md:text-4xl">
                  {featuredTitle}
                </h2>
                <p className="text-muted-foreground">{featuredSubtitle}</p>
              </div>
              <Button variant="outline" asChild className="shrink-0 self-start sm:self-auto">
                <AmzLink href={amzNavHref(locale, '/reviews')}>View All Reviews</AmzLink>
              </Button>
            </div>
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
              {featuredRow.map((row) => (
                <li key={row.offer.id}>
                  <AmzFeaturedOfferCard
                    offer={row.offer}
                    locale={locale}
                    reviewSlug={row.reviewSlug}
                    excerpt={row.excerpt}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <AmzHomeCta
        title={cta.title}
        subtitle={cta.subtitle}
        emailPlaceholder={cta.emailPlaceholder}
        buttonText={cta.buttonText}
      />
    </main>
  )
}
