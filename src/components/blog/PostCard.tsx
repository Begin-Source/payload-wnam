import Link from 'next/link'
import React from 'react'

import type { AppLocale } from '@/i18n/config'
import type { Article, Media } from '@/payload-types'

import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'

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

type Props = {
  article: Article
  locale: AppLocale
  /** Denser list row in "related" sections */
  variant?: 'default' | 'related'
}

const readMoreLabel: Record<AppLocale, string> = {
  en: 'Read more',
  zh: '阅读全文',
}

export function PostCard(props: Props) {
  const { article, locale, variant = 'default' } = props
  const href = articlePath(locale, article)
  const img = mediaUrl(article.featuredImage)
  const date =
    article.publishedAt != null
      ? new Date(article.publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null
  const category = firstCategoryFromArticle(article)
  const titleAlt = article.title?.trim() || 'Featured image'
  const cardClass =
    variant === 'related' ? 'blogCard blogCardRelated' : 'blogCard'

  return (
    <article className={cardClass}>
      <Link href={href} className="blogCardImageLink" tabIndex={-1} aria-hidden>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="blogCardImage" src={img} alt={titleAlt} width={280} height={210} />
        ) : (
          <div className="blogCardImage" aria-hidden />
        )}
      </Link>
      <div>
        {category ? (
          <div className="blogCardCategory">
            <Link href={`/${locale}/categories/${encodeURIComponent(category.slug)}`}>
              {category.name}
            </Link>
          </div>
        ) : null}
        <h2 className="blogCardTitle">
          <Link href={href}>{article.title}</Link>
        </h2>
        {date ? <div className="blogCardMeta">{date}</div> : null}
        {article.excerpt ? <p className="blogCardExcerpt blogCardExcerptClamp">{article.excerpt}</p> : null}
        <Link className="blogBtn" href={href}>
          {readMoreLabel[locale]}
        </Link>
      </div>
    </article>
  )
}
