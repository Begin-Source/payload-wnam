import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import { amzNavHref } from '@/amz-template-1/amzNavHref'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Category, Offer } from '@/payload-types'

import { AmzCategoryBrowseGrid } from './AmzCategoryBrowseGrid'
import { buildAmzCategoryCards } from './categoryCards'
import { AmzOfferCard } from './AmzOfferCard'

export function AmzProductsPage({
  locale,
  config,
  offers,
  categories,
  activeCategorySlug,
  productCountBySlug,
}: {
  locale: AppLocale
  config: AmzSiteConfig
  offers: Offer[]
  categories: Category[]
  /** ?category= 当前选中的分类 slug（高亮 chip / 卡片） */
  activeCategorySlug?: string | null
  /** Per-category active offer counts for browse cards */
  productCountBySlug: Record<string, number>
}) {
  const p = config.pages.products
  const hp = config.homepage.categories
  const catCards = buildAmzCategoryCards(config, categories)
  const productsBase = amzNavHref(locale, '/products')

  return (
    <div className="container mx-auto px-4 py-10">
      <section className="mb-10 rounded-2xl border border-border bg-muted/40 px-6 py-10 md:px-10 md:py-12">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-3xl font-bold text-foreground md:text-4xl">{p.title}</h1>
          <p className="mt-4 text-balance text-lg text-muted-foreground">{p.description}</p>
          {p.indexNote?.trim() ? (
            <p className="mt-2 text-balance text-sm text-muted-foreground">{p.indexNote.trim()}</p>
          ) : null}
        </header>
      </section>

      {catCards.length > 0 ? (
        <>
          <AmzCategoryBrowseGrid
            cards={catCards}
            hrefForSlug={(slug) => `${productsBase}?category=${encodeURIComponent(slug)}`}
            sectionTitle={hp.title}
            sectionSubtitle={hp.subtitle}
            productCountBySlug={productCountBySlug}
            categoryProductCountTemplate={p.categoryProductCountTemplate}
            categoryProductCountEmpty={p.categoryProductCountEmpty}
            activeSlug={activeCategorySlug}
          />
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <AmzLink
              href={productsBase}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                !activeCategorySlug?.trim()
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:border-primary'
              }`}
            >
              All products
            </AmzLink>
            {catCards.map((c) => {
              const active = activeCategorySlug?.trim() === c.slug.trim()
              return (
                <AmzLink
                  key={c.slug}
                  href={`${productsBase}?category=${encodeURIComponent(c.slug.trim())}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary'
                  }`}
                >
                  {c.title}
                </AmzLink>
              )
            })}
          </div>
        </>
      ) : null}

      {offers.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">No active offers yet for this site.</p>
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 lg:gap-3">
          {offers.map((o) => (
            <li key={o.id}>
              <AmzOfferCard offer={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
