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
  variant: 'roundup' | 'comparison'
}

/**
 * 联盟「清单 / Deal / 产品对比」壳：与标准博客共用正文 HTML；对比用 modifier 加宽表格等。
 */
export function ArticleLayoutAffiliateHub({
  article,
  locale,
  homeLabel,
  readMinutes,
  readTimeLabel,
  titleAlt,
  html,
  related,
  variant,
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

  const mod =
    variant === 'comparison' ? 'affiliateHubArticle affiliateHubArticle--comparison' : 'affiliateHubArticle'

  return (
    <article className={mod} data-affiliate-layout="hub" data-hub-variant={variant}>
      <ArticleBreadcrumbs
        locale={locale}
        homeLabel={homeLabel}
        category={firstCat}
        currentTitle={article.title}
      />
      <h1 className="affiliateHubH1">{article.title}</h1>
      <div className="blogArticleMeta">
        {date ? <time dateTime={article.publishedAt ?? undefined}>{date}</time> : null}
        {date ? <span className="blogArticleMetaSep" aria-hidden /> : null}
        <span className="blogArticleReadTime">{readTimeLabel(readMinutes)}</span>
      </div>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="affiliateHubHero"
          src={img}
          alt={titleAlt}
          width={1200}
          height={630}
        />
      ) : null}
      <div className="affiliateHubBody blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
      {related}
    </article>
  )
}
