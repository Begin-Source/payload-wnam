import React from 'react'

import type { AppLocale } from '@/i18n/config'
import type { Article } from '@/payload-types'

import { PostCard } from './PostCard'

type Props = {
  articles: Article[]
  locale: AppLocale
  title: string
}

export function ArticleRelated({ articles, locale, title }: Props) {
  if (articles.length === 0) return null
  return (
    <section className="blogRelated" aria-label={title}>
      <h2 className="blogRelatedTitle">{title}</h2>
      <div className="blogRelatedList">
        {articles.map((a) => (
          <PostCard key={a.id} article={a} locale={locale} variant="related" />
        ))}
      </div>
    </section>
  )
}
