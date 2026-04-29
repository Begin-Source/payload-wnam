import Link from 'next/link'
import React from 'react'

import { PostCard } from '@/components/blog/PostCard'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

type Props = {
  theme: PublicSiteTheme
  locale: AppLocale
  categories: Category[]
  articles: Article[]
}

const FEATURED_COUNT = 6

export function ReviewHubHome(props: Props) {
  const { theme, locale, categories, articles } = props
  const prefix = `/${locale}`
  const featured = articles.slice(0, FEATURED_COUNT)

  return (
    <div>
      <section className="reviewHubHero">
        <h1>{theme.siteName}</h1>
        <p className="reviewHubHeroLead">{theme.reviewHubTaglineResolved}</p>
        <div className="reviewHubSearch">
          <p className="reviewHubSearchHint">Search (coming soon)</p>
          <input
            type="search"
            name="q"
            className="reviewHubSearchInput"
            placeholder="Search reviews and guides…"
            readOnly
            aria-readonly="true"
            autoComplete="off"
          />
        </div>
      </section>

      <section className="reviewHubSection" aria-labelledby="review-hub-cats">
        <h2 id="review-hub-cats" className="reviewHubSectionTitle">
          Product categories
        </h2>
        <p className="reviewHubSectionSub">Explore categories and buying advice.</p>
        {categories.length === 0 ? (
          <p style={{ color: 'var(--blog-body)' }}>No categories yet.</p>
        ) : (
          <div className="reviewHubCategoryGrid">
            {categories.map((c) => {
              const initial = (c.name?.trim().charAt(0) || '?').toUpperCase()
              return (
                <Link
                  key={c.id}
                  className="reviewHubCategoryCard"
                  href={`${prefix}/categories/${encodeURIComponent(c.slug)}`}
                >
                  <div className="reviewHubCategoryThumb" aria-hidden>
                    {initial}
                  </div>
                  <div className="reviewHubCategoryBody">
                    <h3>{c.name}</h3>
                    {c.description ? (
                      <p>{c.description}</p>
                    ) : (
                      <p>Guides and reviews in this category.</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section className="reviewHubSection" aria-labelledby="review-hub-featured">
        <h2 id="review-hub-featured" className="reviewHubSectionTitle">
          Featured reviews
        </h2>
        <p className="reviewHubSectionSub">Top picks from our latest coverage.</p>
        {featured.length === 0 ? (
          <p style={{ color: 'var(--blog-body)' }}>No published posts yet.</p>
        ) : (
          <div className="reviewHubFeatured">
            {featured.map((a) => (
              <PostCard key={a.id} article={a} locale={locale} />
            ))}
          </div>
        )}
      </section>

      <section className="reviewHubSubscribe" aria-labelledby="review-hub-newsletter">
        <h2 id="review-hub-newsletter">Stay updated</h2>
        <p>Get the latest reviews and guides. Newsletter signup is coming soon.</p>
        <div className="reviewHubSubscribeForm">
          <input type="email" placeholder="you@example.com" disabled readOnly aria-disabled="true" />
          <button type="button" disabled>
            Subscribe
          </button>
        </div>
      </section>
    </div>
  )
}
