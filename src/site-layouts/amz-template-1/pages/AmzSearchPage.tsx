import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-1/AmzLink'
import { Button } from '@/site-layouts/amz-template-1/components/ui/button'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/site-layouts/amz-template-1/amzNavHref'
import type { AppLocale } from '@/i18n/config'
import type { Article } from '@/payload-types'
import { BookOpen, Search } from 'lucide-react'

import { AmzArticleCards } from './AmzArticleCards'
import { AmzHomeHeroSearch } from './AmzHomeHeroSearch'

const copy = {
  en: {
    title: 'Search Results',
    emptyPrompt:
      'Enter a search term to find reviews and guides, or browse collections below.',
    resultsFor: (n: number, q: string) =>
      n > 0
        ? `Found ${n} result${n !== 1 ? 's' : ''} for "${q}".`
        : `No results found for "${q}".`,
    noResultsTitle: 'No Results Found',
    noResultsBody: 'Try different keywords or browse reviews and guides.',
    startTitle: 'Start Your Search',
    startBody: 'Search gear, brands, or topics to jump into our latest posts.',
    browseReviews: 'Browse All Reviews',
    browseGuides: 'View Buying Guides',
    articlesHeading: (n: number) => `Articles (${n})`,
  },
  zh: {
    title: '搜索结果',
    emptyPrompt: '输入关键词搜索评测与指南，或浏览下方入口。',
    resultsFor: (n: number, q: string) =>
      n > 0 ? `找到 ${n} 条与「${q}」相关的结果。` : `未找到与「${q}」相关的结果。`,
    noResultsTitle: '未找到结果',
    noResultsBody: '试试其他关键词，或浏览评测与指南。',
    startTitle: '开始搜索',
    startBody: '搜索装备、品牌或话题，查看站内的文章与推荐。',
    browseReviews: '全部评测',
    browseGuides: '购买指南',
    articlesHeading: (n: number) => `文章（${n}）`,
  },
} as const

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
  const t = locale === 'zh' ? copy.zh : copy.en
  const trimmed = q.trim()
  const reviewsHref = amzNavHref(locale, '/reviews')
  const guidesHref = amzNavHref(locale, '/guides')

  const browseRow = (
    <div className="flex flex-wrap justify-center gap-4">
      <Button asChild variant="default" size="lg">
        <AmzLink href={reviewsHref}>{t.browseReviews}</AmzLink>
      </Button>
      <Button asChild variant="outline" size="lg">
        <AmzLink href={guidesHref}>{t.browseGuides}</AmzLink>
      </Button>
    </div>
  )

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <Search className="h-8 w-8 shrink-0 text-primary" aria-hidden />
              <h1 className="text-4xl font-bold text-foreground">{t.title}</h1>
            </div>
            {trimmed ? (
              <p className="text-lg text-muted-foreground">{t.resultsFor(articles.length, trimmed)}</p>
            ) : (
              <p className="text-lg text-muted-foreground">{t.emptyPrompt}</p>
            )}
          </div>

          <AmzHomeHeroSearch locale={locale} placeholder={placeholder} initialQuery={q} layout="pill" />

          {trimmed && articles.length > 0 ? (
            <div className="mt-12 space-y-12">
              <div>
                <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-foreground">
                  <BookOpen className="h-6 w-6 text-primary" aria-hidden />
                  {t.articlesHeading(articles.length)}
                </h2>
                <AmzArticleCards articles={articles} locale={locale} />
              </div>
            </div>
          ) : null}

          {trimmed && articles.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-6">
                <Search className="mx-auto mb-4 h-16 w-16 text-muted-foreground" aria-hidden />
                <h2 className="mb-2 text-2xl font-bold text-foreground">{t.noResultsTitle}</h2>
                <p className="mb-6 text-muted-foreground">{t.noResultsBody}</p>
              </div>
              {browseRow}
            </div>
          ) : null}

          {!trimmed ? (
            <div className="py-12 text-center">
              <Search className="mx-auto mb-4 h-16 w-16 text-muted-foreground" aria-hidden />
              <h2 className="mb-2 text-2xl font-bold text-foreground">{t.startTitle}</h2>
              <p className="mb-6 text-muted-foreground">{t.startBody}</p>
              {browseRow}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
