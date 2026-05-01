import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-1/AmzLink'
import { ArticleBreadcrumbs } from '@/components/blog/ArticleBreadcrumbs'
import { ArticleRelated } from '@/components/blog/ArticleRelated'
import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Article, Media, Offer } from '@/payload-types'

import { AmzOfferCard } from './AmzOfferCard'

const breadcrumbHome: Record<AppLocale, string> = {
  zh: '首页',
  en: 'Home',
}

const relatedTitle: Record<AppLocale, string> = {
  zh: '继续阅读',
  en: 'Read next',
}

function offersFromArticle(article: Article): Offer[] {
  const raw = article.relatedOffers
  if (!raw || !Array.isArray(raw)) return []
  return raw.filter((o): o is Offer => typeof o === 'object' && o !== null && 'id' in o && 'title' in o)
}

export function AmzArticlePage({
  article,
  html,
  locale,
  readMinutes,
  readTimeLabel,
  related,
  titleAlt,
  config: _config,
}: {
  article: Article
  html: string
  locale: AppLocale
  readMinutes: number
  readTimeLabel: (n: number) => string
  related: Article[]
  titleAlt: string
  config: AmzSiteConfig
}) {
  void _config

  const img =
    article.featuredImage != null &&
    typeof article.featuredImage === 'object' &&
    'url' in article.featuredImage &&
    typeof (article.featuredImage as Media).url === 'string'
      ? (article.featuredImage as Media).url
      : null
  const date =
    article.publishedAt != null
      ? new Date(article.publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null
  const firstCat = firstCategoryFromArticle(article)
  const offers = offersFromArticle(article)

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <article className="container mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <ArticleBreadcrumbs
        locale={locale}
        homeLabel={breadcrumbHome[locale]}
        category={firstCat}
        currentTitle={article.title}
      />

      <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-foreground md:text-5xl">
        {article.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {date ? <time dateTime={article.publishedAt ?? undefined}>{date}</time> : null}
        {date ? <span aria-hidden>·</span> : null}
        <span>{readTimeLabel(readMinutes)}</span>
        {firstCat?.slug ? (
          <AmzLink
            href={`/${locale}/categories/${encodeURIComponent(firstCat.slug)}`}
            className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
          >
            {firstCat.name}
          </AmzLink>
        ) : null}
      </div>

      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="mt-8 w-full rounded-lg border border-border object-cover"
          src={img}
          alt={titleAlt}
          width={1200}
          height={630}
        />
      ) : null}

      <div
        className="prose prose-neutral mt-8 max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {offers.length > 0 ? (
        <section className="mt-12 rounded-xl border border-border bg-card p-6 shadow-sm" aria-label="Featured products">
          <h2 className="text-lg font-semibold text-foreground">Featured products</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((offer) => (
              <AmzOfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12">
        <ArticleRelated articles={related} locale={locale} title={relatedTitle[locale]} />
      </section>
      </article>
    </main>
  )
}
