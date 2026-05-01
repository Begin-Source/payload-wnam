import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-1/AmzLink'
import { cn } from '@/site-layouts/amz-template-1/lib/utils'

import type { AmzCategoryCard } from './categoryCards'
import { CategoryCardIcon } from './CategoryCardIcon'

export type AmzCategoryBrowseGridProps = {
  cards: AmzCategoryCard[]
  hrefForSlug: (slug: string) => string
  /** `home` matches `amz-template-old` homepage category band (py-16, gap-6, xl:grid-cols-5). */
  layoutVariant?: 'default' | 'home'
  sectionTitle?: string
  sectionSubtitle?: string
  /** When set, cards show offer counts instead of description blurbs (products index). */
  productCountBySlug?: Record<string, number>
  categoryProductCountTemplate?: string
  categoryProductCountEmpty?: string
  /** Highlights card when slug matches `?category=` filter */
  activeSlug?: string | null
}

function formatProductCountLine(
  slug: string,
  counts: Record<string, number>,
  tmpl: string | undefined,
  empty: string | undefined,
): string {
  const n = counts[slug] ?? 0
  if (n === 0 && empty?.trim()) return empty.trim()
  return (tmpl ?? '{count} products').replace(/\{count\}/g, String(n))
}

export function AmzCategoryBrowseGrid(props: AmzCategoryBrowseGridProps) {
  const {
    cards,
    hrefForSlug,
    layoutVariant = 'default',
    sectionTitle,
    sectionSubtitle,
    productCountBySlug,
    categoryProductCountTemplate,
    categoryProductCountEmpty,
    activeSlug,
  } = props

  if (cards.length === 0) return null

  const showCounts = productCountBySlug != null
  const single = cards.length === 1
  const isHome = layoutVariant === 'home'

  const header =
    sectionTitle?.trim() || sectionSubtitle?.trim() ? (
      <header className={isHome ? 'mb-12 text-center' : 'mx-auto max-w-3xl text-center'}>
        {sectionTitle?.trim() ? (
          <h2
            className={
              isHome
                ? 'mb-4 text-balance text-3xl font-bold text-foreground md:text-4xl'
                : 'text-balance text-2xl font-semibold text-foreground md:text-3xl'
            }
          >
            {sectionTitle.trim()}
          </h2>
        ) : null}
        {sectionSubtitle?.trim() ? (
          <p
            className={
              isHome
                ? 'mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground'
                : 'mt-2 text-balance text-muted-foreground'
            }
          >
            {sectionSubtitle.trim()}
          </p>
        ) : null}
      </header>
    ) : null

  const grid = (
    <ul
      className={
        isHome
          ? 'grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
          : 'mt-8 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 lg:gap-3'
      }
    >
        {cards.map((card) => {
          const active = activeSlug?.trim() === card.slug.trim()
          const countLine =
            showCounts && productCountBySlug
              ? formatProductCountLine(
                  card.slug.trim(),
                  productCountBySlug,
                  categoryProductCountTemplate,
                  categoryProductCountEmpty,
                )
              : null
          return (
            <li key={card.slug} className={cn('min-w-0', single && 'col-span-full flex justify-center')}>
              <AmzLink
                href={hrefForSlug(card.slug.trim())}
                className={cn(
                  'group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md',
                  active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary',
                  single && 'max-w-xs sm:max-w-[200px] lg:max-w-[200px]',
                )}
              >
                <div className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted sm:aspect-video">
                  {card.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.coverImage}
                      alt=""
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <CategoryCardIcon
                      name={card.icon}
                      className="h-11 w-11 text-muted-foreground/80 sm:h-12 sm:w-12"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col items-center px-2 py-3 text-center sm:px-3">
                  <span className="text-balance text-sm font-semibold leading-snug text-foreground underline-offset-2 group-hover:underline sm:text-base">
                    {card.title}
                  </span>
                  {showCounts && countLine ? (
                    <span className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {countLine}
                    </span>
                  ) : card.description ? (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-muted-foreground sm:text-sm">
                      {card.description}
                    </p>
                  ) : null}
                </div>
              </AmzLink>
            </li>
          )
        })}
    </ul>
  )

  if (isHome) {
    return (
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {header}
          {grid}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-12">
      {header}
      {grid}
    </section>
  )
}
