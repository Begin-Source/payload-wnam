import React from 'react'

import type { AppLocale } from '@/i18n/config'
import type { Article } from '@/payload-types'

import { PostCard } from '@/components/blog/PostCard'

type Props = {
  articles: Article[]
  locale: AppLocale
}

export function PostList(props: Props) {
  const { articles, locale } = props
  if (articles.length === 0) {
    return <p style={{ color: 'var(--blog-body)' }}>No published posts yet.</p>
  }
  return (
    <div className="blogPostList">
      {articles.map((a) => (
        <PostCard key={a.id} article={a} locale={locale} />
      ))}
    </div>
  )
}
