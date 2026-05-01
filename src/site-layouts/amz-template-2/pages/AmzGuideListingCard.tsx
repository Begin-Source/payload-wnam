'use client'

import { Clock } from 'lucide-react'
import React from 'react'

import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import type { AppLocale } from '@/i18n/config'
import type { Article, Media } from '@/payload-types'

import { articleHref } from './AmzArticleCards'

function mediaUrl(featured: Article['featuredImage']): string | null {
  if (featured == null) return null
  if (typeof featured === 'object' && featured !== null && 'url' in featured) {
    const u = (featured as Media).url
    return typeof u === 'string' ? u : null
  }
  return null
}

function readTimeCopy(locale: AppLocale, n: number): string {
  return locale === 'zh' ? `约 ${n} 分钟阅读` : `${n} min read`
}

export function AmzGuideListingCard({
  article,
  locale,
  readMinutes,
}: {
  article: Article
  locale: AppLocale
  readMinutes: number
}) {
  const href = articleHref(locale, article)
  const img = mediaUrl(article.featuredImage)
  const category = firstCategoryFromArticle(article)
  const excerpt = article.excerpt?.trim() ?? ''
  const minutes = Math.max(1, readMinutes)

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <AmzLink href={href} className="block aspect-video w-full shrink-0 overflow-hidden bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full min-h-[12rem] items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </AmzLink>
      <div className="flex flex-1 flex-col space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {category?.name ? (
            <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{category.name}</span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {readTimeCopy(locale, minutes)}
          </span>
        </div>
        <AmzLink href={href} className="block">
          <h2 className="text-base font-bold leading-snug text-foreground hover:text-primary md:text-lg">
            {article.title}
          </h2>
        </AmzLink>
        {excerpt ? (
          <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{excerpt}</p>
        ) : null}
      </div>
    </article>
  )
}
