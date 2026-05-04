import React from 'react'

import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Category, Offer } from '@/payload-types'
import { resolveAmzProductsHero } from '@/utilities/resolveAmzLocaleUi'

import { AmzProductsBrowseClient } from './AmzProductsBrowseClient'

export function AmzProductsPage({
  locale,
  defaultPublicLocale,
  config,
  offers,
  categories,
  activeCategorySlug,
  productCountBySlug,
  initialSearch = '',
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  config: AmzSiteConfig
  offers: Offer[]
  categories: Category[]
  activeCategorySlug?: string | null
  productCountBySlug: Record<string, number>
  initialSearch?: string
}) {
  const { title, description, indexNote } = resolveAmzProductsHero(config, locale, defaultPublicLocale)

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto amz-page-x-gutter py-12 md:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex w-full flex-col items-center">
            <h1 className="mb-4 w-full text-balance text-center text-4xl font-bold text-foreground md:text-5xl">
              {title}
            </h1>
            <div className="w-full max-w-2xl">
              <p className="!text-center text-lg leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
            {indexNote ? (
              <div className="mt-2 w-full max-w-2xl">
                <p className="!text-center text-sm leading-relaxed text-muted-foreground">
                  {indexNote}
                </p>
              </div>
            ) : null}
          </div>

          <AmzProductsBrowseClient
            locale={locale}
            defaultPublicLocale={defaultPublicLocale}
            config={config}
            offers={offers}
            categories={categories}
            productCountBySlug={productCountBySlug}
            initialCategorySlug={activeCategorySlug ?? null}
            initialSearch={initialSearch}
          />
        </div>
      </div>
    </main>
  )
}
