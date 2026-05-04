'use client'

import { ChevronDown } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { amzNavHref } from '@/site-layouts/amz-template-2/amzNavHref'
import { appendAmzSite } from '@/site-layouts/amz-template-2/appendAmzSite'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/site-layouts/amz-template-2/components/ui/collapsible'
import { Input } from '@/site-layouts/amz-template-2/components/ui/input'
import { useIsMobile } from '@/site-layouts/amz-template-2/hooks/use-mobile'
import type { AppLocale } from '@/i18n/config'
import type { Article, Author } from '@/payload-types'
import {
  AMZ_BROWSE_CATEGORIES,
  AMZ_BROWSE_CLEAR_FILTERS,
  AMZ_GUIDES_ALL,
  AMZ_GUIDES_EMPTY,
  AMZ_GUIDES_SEARCH_PLACEHOLDER,
  AMZ_GUIDES_SHOWING_MANY,
  AMZ_GUIDES_SHOWING_ONE,
} from '@/utilities/amzBrowseUiStrings'
import { applyUiTemplate, pickUiString } from '@/utilities/getLocalizedString'

import { AmzGuideListingCard } from './AmzGuideListingCard'

export type GuideNavItem = {
  slug: string
  name: string
  cmsId?: number
}

function articleMatchesGuide(article: Article, guideSlug: string, guideName: string): boolean {
  const cats = article.categories ?? []
  for (const c of cats) {
    if (typeof c !== 'object' || c === null) continue
    const slug = 'slug' in c ? String((c as { slug?: string }).slug ?? '') : ''
    const name = 'name' in c ? String((c as { name?: string }).name ?? '') : ''
    if (slug && slug === guideSlug) return true
    if (name && name === guideName) return true
  }
  return false
}

function articleHasCategoryId(article: Article, categoryId: number): boolean {
  const cats = article.categories ?? []
  for (const c of cats) {
    if (typeof c === 'number' && c === categoryId) return true
    if (typeof c === 'object' && c !== null && 'id' in c && (c as { id?: number }).id === categoryId) {
      return true
    }
  }
  return false
}

function authorSearchText(author: Article['author']): string {
  if (author && typeof author === 'object' && 'displayName' in author) {
    return String((author as Author).displayName ?? '')
  }
  return ''
}

function matchesSearch(article: Article, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  const title = (article.title ?? '').toLowerCase()
  const excerpt = (article.excerpt ?? '').toLowerCase()
  const by = authorSearchText(article).toLowerCase()
  return title.includes(n) || excerpt.includes(n) || by.includes(n)
}

function countArticlesForGuideItem(
  articles: Article[],
  item: GuideNavItem,
  guideCategoryMode: 'cms' | 'json',
): number {
  if (guideCategoryMode === 'cms' && item.cmsId != null) {
    return articles.filter((a) => articleHasCategoryId(a, item.cmsId!)).length
  }
  return articles.filter((a) => articleMatchesGuide(a, item.slug, item.name)).length
}

function articleMatchesGuideFilter(
  article: Article,
  item: GuideNavItem,
  guideCategoryMode: 'cms' | 'json',
): boolean {
  if (guideCategoryMode === 'cms' && item.cmsId != null) {
    return articleHasCategoryId(article, item.cmsId)
  }
  return articleMatchesGuide(article, item.slug, item.name)
}

export function AmzGuidesBrowseClient({
  locale,
  defaultPublicLocale,
  articles,
  guideNavItems,
  guideCategoryMode,
  readMinutesByArticleId,
  initialCategorySlug,
  initialSearch,
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  articles: Article[]
  guideNavItems: GuideNavItem[]
  guideCategoryMode: 'cms' | 'json'
  readMinutesByArticleId: Record<number, number>
  initialCategorySlug: string | null
  initialSearch: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const urlSearch = useSearchParams()
  const site = urlSearch?.get('site')
  const isMobile = useIsMobile()
  const [mobileCatOpen, setMobileCatOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState(initialSearch)

  useEffect(() => {
    setLocalSearch(initialSearch)
  }, [initialSearch])

  const replaceQuery = useCallback(
    (category: string | null, search: string) => {
      const p = new URLSearchParams(urlSearch?.toString() ?? '')
      if (category?.trim()) p.set('category', category.trim())
      else p.delete('category')
      const st = search.trim()
      if (st) p.set('search', st)
      else p.delete('search')
      const qs = p.toString()
      const path = pathname ?? amzNavHref(locale, '/guides')
      const target = qs ? `${path}?${qs}` : path
      router.replace(appendAmzSite(target, site), { scroll: false })
    },
    [locale, pathname, router, site, urlSearch],
  )

  const validSlugs = useMemo(() => new Set(guideNavItems.map((i) => i.slug)), [guideNavItems])
  const activeSlug =
    initialCategorySlug && validSlugs.has(initialCategorySlug) ? initialCategorySlug : null

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (localSearch.trim() !== initialSearch.trim()) {
        replaceQuery(activeSlug, localSearch)
      }
    }, 320)
    return () => window.clearTimeout(id)
  }, [localSearch, initialSearch, activeSlug, replaceQuery])

  const searchForFilter = localSearch.trim()

  const filtered = useMemo(() => {
    const list = [...articles].sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return tb - ta
    })
    let out = list
    if (activeSlug) {
      const item = guideNavItems.find((i) => i.slug === activeSlug)
      if (item) {
        out = out.filter((a) => articleMatchesGuideFilter(a, item, guideCategoryMode))
      }
    }
    if (searchForFilter) {
      out = out.filter((a) => matchesSearch(a, searchForFilter))
    }
    return out
  }, [articles, activeSlug, guideNavItems, guideCategoryMode, searchForFilter])

  const p = (m: Partial<Record<AppLocale, string>>) =>
    pickUiString(locale, defaultPublicLocale, m)
  const allGuidesLabel = p(AMZ_GUIDES_ALL)
  const categoriesLabel = p(AMZ_BROWSE_CATEGORIES)
  const showingLabel =
    filtered.length === 1
      ? p(AMZ_GUIDES_SHOWING_ONE)
      : applyUiTemplate(p(AMZ_GUIDES_SHOWING_MANY), { count: filtered.length })

  const sidebarInner = (
    <nav className="space-y-1">
      <button
        type="button"
        onClick={() => replaceQuery(null, localSearch)}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
          !activeSlug ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
        }`}
      >
        <span>
          {allGuidesLabel} ({articles.length})
        </span>
      </button>
      {guideNavItems.map((item) => {
        const cnt = countArticlesForGuideItem(articles, item, guideCategoryMode)
        return (
          <button
            key={item.slug}
            type="button"
            onClick={() => replaceQuery(item.slug, localSearch)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeSlug === item.slug ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            <span className="line-clamp-2">{item.name}</span>
            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">({cnt})</span>
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-10 xl:gap-12">
      <aside className="w-full shrink-0 lg:w-80">
        <div className="rounded-xl border-2 border-border bg-card p-4 sm:p-5">
          {isMobile ? (
            <Collapsible open={mobileCatOpen} onOpenChange={setMobileCatOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg py-2 text-left font-semibold text-foreground">
                {categoriesLabel}
                <ChevronDown className={`h-4 w-4 transition-transform ${mobileCatOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">{sidebarInner}</CollapsibleContent>
            </Collapsible>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {categoriesLabel}
              </h2>
              {sidebarInner}
            </>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-6 lg:space-y-8">
        <div className="flex flex-col gap-4 rounded-xl border-2 border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-sm font-medium text-foreground">{showingLabel}</p>
          <div className="w-full sm:max-w-xs">
            <Input
              type="search"
              placeholder={p(AMZ_GUIDES_SEARCH_PLACEHOLDER)}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
            <p className="text-muted-foreground">{p(AMZ_GUIDES_EMPTY)}</p>
            <button
              type="button"
              className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setLocalSearch('')
                replaceQuery(null, '')
              }}
            >
              {p(AMZ_BROWSE_CLEAR_FILTERS)}
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-8">
            {filtered.map((article) => (
              <li key={article.id} className="min-w-0">
                <AmzGuideListingCard
                  article={article}
                  locale={locale}
                  defaultPublicLocale={defaultPublicLocale}
                  readMinutes={readMinutesByArticleId[article.id] ?? 1}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
