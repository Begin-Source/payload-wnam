import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import type { AppLocale } from '@/i18n/config'
import type { Article, Media } from '@/payload-types'

function mediaUrl(featured: Article['featuredImage']): string | null {
  if (featured == null) return null
  if (typeof featured === 'object' && featured !== null && 'url' in featured) {
    const u = (featured as Media).url
    return typeof u === 'string' ? u : null
  }
  return null
}

export function articleHref(locale: AppLocale, a: Article): string {
  const slug = a.slug?.trim()
  if (slug) return `/${locale}/posts/${encodeURIComponent(slug)}`
  return `/${locale}/posts/id-${a.id}`
}

export function AmzArticleCards({ articles, locale }: { articles: Article[]; locale: AppLocale }) {
  if (articles.length === 0) {
    return <p className="text-center text-muted-foreground">No posts yet.</p>
  }
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => {
        const href = articleHref(locale, article)
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
                  <span className="text-xs font-medium uppercase tracking-wide text-primary">{category.name}</span>
                ) : null}
                <AmzLink href={href} className="mt-2 block">
                  <h3 className="text-lg font-semibold text-foreground hover:text-primary">{article.title}</h3>
                </AmzLink>
                {article.excerpt?.trim() ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.excerpt.trim()}</p>
                ) : null}
                <AmzLink href={href} className="mt-auto pt-4 text-sm font-medium text-primary hover:underline">
                  Read more →
                </AmzLink>
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
