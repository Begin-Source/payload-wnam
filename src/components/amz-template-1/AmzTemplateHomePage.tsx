import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'

import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category, Media, Offer } from '@/payload-types'

import { AmzCategoryBrowseGrid } from './AmzCategoryBrowseGrid'
import { buildAmzCategoryCards } from './categoryCards'
import { AmzOfferCard } from './AmzOfferCard'
import { AmzTemplateHomeHero } from './AmzTemplateHomeHero'

function mediaUrl(featured: Article['featuredImage']): string | null {
  if (featured == null) return null
  if (typeof featured === 'object' && featured !== null && 'url' in featured) {
    const u = (featured as Media).url
    return typeof u === 'string' ? u : null
  }
  return null
}

function articlePath(locale: AppLocale, a: Article): string {
  const slug = a.slug?.trim()
  if (slug) return `/${locale}/posts/${encodeURIComponent(slug)}`
  return `/${locale}/posts/id-${a.id}`
}

export type AmzTemplateHomePageProps = {
  locale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  categories: Category[]
  /** Homepage Featured Products — from Offers.featuredOnHomeForSites */
  featuredOffers: Offer[]
}

export function AmzTemplateHomePage(props: AmzTemplateHomePageProps) {
  const { locale, config, articles, categories, featuredOffers } = props
  const featuredTitle = config.homepage.featuredProducts.title
  const featuredSubtitle = config.homepage.featuredProducts.subtitle
  const latestReviews = config.homepage.latestReviews ?? {
    title: 'Latest reviews',
    subtitle: '',
  }
  const latestTitle = latestReviews.title
  const latestSubtitle = latestReviews.subtitle ?? ''
  const catTitle = config.homepage.categories.title
  const catSubtitle = config.homepage.categories.subtitle

  const categoryCards = buildAmzCategoryCards(config, categories)

  return (
    <div className="w-full">
      <AmzTemplateHomeHero locale={locale} config={config} />

      <div className="container mx-auto px-4 py-10">
        {categoryCards.length > 0 ? (
          <AmzCategoryBrowseGrid
            cards={categoryCards}
            hrefForSlug={(slug) => `/${locale}/categories/${encodeURIComponent(slug)}`}
            sectionTitle={catTitle}
            sectionSubtitle={catSubtitle}
          />
        ) : null}

        {featuredOffers.length > 0 ? (
          <section className="mb-16">
            <header className="mx-auto max-w-3xl text-center">
              <h2 className="text-balance text-2xl font-semibold text-foreground md:text-3xl">
                {featuredTitle}
              </h2>
              <p className="mt-2 text-balance text-muted-foreground">{featuredSubtitle}</p>
            </header>
            <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 lg:gap-3">
              {featuredOffers.map((o) => (
                <li key={o.id}>
                  <AmzOfferCard offer={o} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <header className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-2xl font-semibold text-foreground md:text-3xl">{latestTitle}</h2>
            {latestSubtitle ? (
              <p className="mt-2 text-balance text-muted-foreground">{latestSubtitle}</p>
            ) : null}
          </header>

          {articles.length === 0 ? (
            <p className="mt-6 text-center text-muted-foreground">No published posts yet.</p>
          ) : (
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => {
                const href = articlePath(locale, article)
                const img = mediaUrl(article.featuredImage)
                const category = firstCategoryFromArticle(article)
                return (
                  <li key={article.id}>
                    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                      <AmzLink href={href} className="block aspect-video w-full overflow-hidden bg-muted">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </AmzLink>
                      <div className="flex flex-1 flex-col p-4">
                        {category ? (
                          <span className="text-xs font-medium uppercase tracking-wide text-primary">
                            {category.name}
                          </span>
                        ) : null}
                        <AmzLink href={href} className="mt-2 block">
                          <h3 className="text-lg font-semibold text-foreground hover:text-primary">
                            {article.title}
                          </h3>
                        </AmzLink>
                        {(() => {
                          const excerpt = article.excerpt?.trim()
                          const metaDesc =
                            typeof article.meta === 'object' &&
                            article.meta !== null &&
                            'description' in article.meta
                              ? String(
                                  (article.meta as { description?: string | null }).description ?? '',
                                ).trim()
                              : ''
                          const blurb = excerpt || metaDesc
                          return blurb ? (
                            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{blurb}</p>
                          ) : null
                        })()}
                        <AmzLink
                          href={href}
                          className="mt-auto pt-4 text-sm font-medium text-primary hover:underline"
                        >
                          Read more →
                        </AmzLink>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
