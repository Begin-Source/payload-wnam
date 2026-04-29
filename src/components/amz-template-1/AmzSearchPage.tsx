import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Article } from '@/payload-types'

import { AmzHomeHeroSearch } from './AmzHomeHeroSearch'

function articleHref(locale: AppLocale, a: Article): string {
  const slug = a.slug?.trim()
  if (slug) return `/${locale}/posts/${encodeURIComponent(slug)}`
  return `/${locale}/posts/id-${a.id}`
}

export function AmzSearchPage({
  locale,
  config,
  q,
  articles,
}: {
  locale: AppLocale
  config: AmzSiteConfig
  q: string
  articles: Article[]
}) {
  const placeholder = config.homepage.hero.searchPlaceholder

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-center text-3xl font-bold text-foreground">Search</h1>
      <div className="mx-auto mt-6 max-w-2xl">
        <AmzHomeHeroSearch locale={locale} placeholder={placeholder} initialQuery={q} />
      </div>

      {q ? (
        <p className="mt-8 text-center text-muted-foreground">
          {articles.length} result(s) for &quot;{q}&quot;
        </p>
      ) : (
        <p className="mt-8 text-center text-muted-foreground">
          Enter a search term above or use the header search.
        </p>
      )}

      <ul className="mt-8 space-y-4">
        {articles.map((a) => {
          const href = articleHref(locale, a)
          return (
            <li key={a.id}>
              <AmzLink href={href} className="text-lg font-semibold text-primary hover:underline">
                {a.title}
              </AmzLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
