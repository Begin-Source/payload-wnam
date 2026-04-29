import React from 'react'

import { ArticleBreadcrumbs } from '@/components/blog/ArticleBreadcrumbs'
import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import type { AppLocale } from '@/i18n/config'
import type { Article } from '@/payload-types'
import type { Media } from '@/payload-types'

type Props = {
  article: Article
  locale: AppLocale
  homeLabel: string
  readMinutes: number
  readTimeLabel: (n: number) => string
  titleAlt: string
  html: string
  related: React.ReactNode
}

/**
 * 联盟长文/评测壳：主栏阅读，头图可较小，宽度略大于默认 720 以利长段落。
 */
export function ArticleLayoutAffiliateEditorial({
  article,
  locale,
  homeLabel,
  readMinutes,
  readTimeLabel,
  titleAlt,
  html,
  related,
}: Props) {
  const firstCat = firstCategoryFromArticle(article)
  const date =
    article.publishedAt != null
      ? new Date(article.publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null
  const img =
    article.featuredImage != null &&
    typeof article.featuredImage === 'object' &&
    'url' in article.featuredImage &&
    typeof (article.featuredImage as Media).url === 'string'
      ? (article.featuredImage as Media).url
      : null

  return (
    <article
      className="affiliateEditorialArticle"
      data-affiliate-layout="editorial"
    >
      <ArticleBreadcrumbs
        locale={locale}
        homeLabel={homeLabel}
        category={firstCat}
        currentTitle={article.title}
      />
      <h1 className="affiliateEditorialH1">{article.title}</h1>
      <div className="blogArticleMeta">
        {date ? <time dateTime={article.publishedAt ?? undefined}>{date}</time> : null}
        {date ? <span className="blogArticleMetaSep" aria-hidden /> : null}
        <span className="blogArticleReadTime">{readTimeLabel(readMinutes)}</span>
      </div>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="affiliateEditorialHero"
          src={img}
          alt={titleAlt}
          width={1200}
          height={480}
        />
      ) : null}
      <div className="affiliateEditorialBody blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
      {related}
    </article>
  )
}
