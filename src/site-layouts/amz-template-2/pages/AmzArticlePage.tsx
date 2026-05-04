import React from 'react'
import { Calendar, Clock, User } from 'lucide-react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { ArticleReviewSidebar } from '@/site-layouts/amz-template-2/components/article-review-sidebar'
import { TableOfContents } from '@/site-layouts/amz-template-2/components/table-of-contents'
import { ArticleBreadcrumbs } from '@/components/blog/ArticleBreadcrumbs'
import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Article, Media } from '@/payload-types'
import { AMZ_ARTICLE_EXPERT_REVIEW, AMZ_ARTICLE_RELATED_REVIEWS } from '@/utilities/amzBrowseUiStrings'
import { pickUiString } from '@/utilities/getLocalizedString'

import { AmzArticleCards } from './AmzArticleCards'

const breadcrumbHome: Record<AppLocale, string> = {
  zh: '首页',
  en: 'Home',
}

export function AmzArticlePage({
  article,
  html,
  locale,
  defaultPublicLocale,
  readMinutes,
  readTimeLabel,
  related,
  titleAlt,
  config,
}: {
  article: Article
  html: string
  locale: AppLocale
  defaultPublicLocale: AppLocale
  readMinutes: number
  readTimeLabel: (n: number) => string
  related: Article[]
  titleAlt: string
  config: AmzSiteConfig
}) {
  const authorName =
    typeof config?.brand?.name === 'string' && config.brand.name.trim()
      ? config.brand.name.trim()
      : typeof config?.seo?.author === 'string' && config.seo.author.trim()
        ? config.seo.author.trim()
        : 'Editor'

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

  const relatedOthers = related.filter((a) => a.id !== article.id)
  /** Full-width grid below article — same first N as sidebar, matching amz-template-old (RELATED_REVIEWS_LIMIT = 4). */
  const relatedReviewsGrid = relatedOthers.slice(0, 4)
  const p = (m: Partial<Record<AppLocale, string>>) =>
    pickUiString(locale, defaultPublicLocale, m)
  const relatedReviewsTitle = p(AMZ_ARTICLE_RELATED_REVIEWS)
  const expertReviewLabel = p(AMZ_ARTICLE_EXPERT_REVIEW)

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <article className="bg-background text-foreground">
        <div className="container mx-auto amz-page-x-gutter py-12 md:py-14 lg:py-16">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
            <aside className="order-2 lg:order-1 lg:col-span-3">
              <div className="lg:sticky lg:top-24">
                <TableOfContents className="shadow-sm" />
              </div>
            </aside>

            <div className="order-1 lg:order-2 lg:col-span-6">
              <ArticleBreadcrumbs
                locale={locale}
                homeLabel={breadcrumbHome[locale]}
                category={firstCat}
                currentTitle={article.title}
              />

              <header className="mb-8 mt-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {firstCat?.slug ? (
                    <AmzLink
                      href={`/${locale}/categories/${encodeURIComponent(firstCat.slug)}`}
                      className="inline-flex rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase text-primary-foreground"
                    >
                      {firstCat.name}
                    </AmzLink>
                  ) : null}
                  <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                    {expertReviewLabel}
                  </span>
                </div>

                <h1 className="mb-6 text-balance text-xl font-bold leading-tight tracking-tight text-foreground md:text-2xl">
                  {article.title}
                </h1>

                <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" aria-hidden />
                    <span>By {authorName}</span>
                  </div>
                  {date ? (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" aria-hidden />
                      <time dateTime={article.publishedAt ?? undefined}>{date}</time>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" aria-hidden />
                    <span>{readTimeLabel(readMinutes)}</span>
                  </div>
                </div>

                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="mb-6 aspect-square w-full rounded-lg border border-border object-cover"
                    src={img}
                    alt={titleAlt}
                    width={1200}
                    height={630}
                  />
                ) : null}

                {article.excerpt?.trim() ? (
                  <p className="text-lg leading-relaxed text-muted-foreground">{article.excerpt.trim()}</p>
                ) : null}
              </header>

              <div
                data-amz-article-prose
                className="prose prose-lg max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>

            <aside className="order-3 lg:col-span-3">
              <ArticleReviewSidebar
                locale={locale}
                category={firstCat}
                currentArticleId={article.id}
                sidebarArticles={related}
              />
            </aside>
          </div>

          {relatedReviewsGrid.length > 0 ? (
            <section className="mx-auto mt-16 max-w-7xl border-t border-border pt-12">
              <h2 className="mb-8 flex items-center gap-3 text-3xl font-bold text-foreground">
                <span className="h-1 w-12 rounded-full bg-primary" aria-hidden />
                {relatedReviewsTitle}
              </h2>
              <AmzArticleCards
                articles={relatedReviewsGrid}
                locale={locale}
                listClassName="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
              />
            </section>
          ) : null}
        </div>
      </article>
    </main>
  )
}
