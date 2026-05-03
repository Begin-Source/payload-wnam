'use client'

import { ChevronDown } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { amzNavHref } from '@/site-layouts/amz-template-2/amzNavHref'
import { appendAmzSite } from '@/site-layouts/amz-template-2/appendAmzSite'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/site-layouts/amz-template-2/components/ui/collapsible'
import { Input } from '@/site-layouts/amz-template-2/components/ui/input'
import { useIsMobile } from '@/site-layouts/amz-template-2/hooks/use-mobile'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Category, Offer } from '@/payload-types'

import { AmzOfferCard } from './AmzOfferCard'
import { buildAmzCategoryCards } from './categoryCards'

function categorySlugsFromOffer(o: Offer): Set<string> {
  const out = new Set<string>()
  for (const c of o.categories ?? []) {
    if (c && typeof c === 'object' && 'slug' in c) {
      const s = (c as Category).slug?.trim()
      if (s) out.add(s)
    }
  }
  return out
}

function matchesSearch(offer: Offer, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  const title = (offer.title ?? '').toLowerCase()
  const asin = (offer.amazon?.asin ?? '').toLowerCase()
  return title.includes(n) || asin.includes(n)
}

export function AmzProductsBrowseClient({
  locale,
  config,
  offers,
  categories,
  productCountBySlug,
  initialCategorySlug,
  initialSearch,
}: {
  locale: AppLocale
  config: AmzSiteConfig
  offers: Offer[]
  categories: Category[]
  productCountBySlug: Record<string, number>
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

  const chips = useMemo(() => buildAmzCategoryCards(config, categories), [config, categories])

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
      const path = pathname ?? amzNavHref(locale, '/products')
      const target = qs ? `${path}?${qs}` : path
      router.replace(appendAmzSite(target, site), { scroll: false })
    },
    [locale, pathname, router, site, urlSearch],
  )

  const activeSlug =
    initialCategorySlug && chips.some((c) => c.slug === initialCategorySlug) ? initialCategorySlug : null

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
    const list = [...offers].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' }))
    let out = list
    if (activeSlug) {
      out = out.filter((o) => categorySlugsFromOffer(o).has(activeSlug))
    }
    if (searchForFilter) {
      out = out.filter((o) => matchesSearch(o, searchForFilter))
    }
    return out
  }, [offers, activeSlug, searchForFilter])

  const allProductsLabel = locale === 'zh' ? '全部商品' : 'All products'
  const showingLabel =
    locale === 'zh'
      ? filtered.length === 1
        ? '共 1 件商品'
        : `共 ${filtered.length} 件商品`
      : filtered.length === 1
        ? 'Showing 1 product'
        : `Showing ${filtered.length} products`

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
          {allProductsLabel} ({offers.length})
        </span>
      </button>
      {chips.map((c) => {
        const cnt = productCountBySlug[c.slug] ?? 0
        return (
          <button
            key={c.slug}
            type="button"
            onClick={() => replaceQuery(c.slug, localSearch)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeSlug === c.slug ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            <span className="line-clamp-2">{c.title}</span>
            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">({cnt})</span>
          </button>
        )
      })}
    </nav>
  )

  const emptyNoData =
    offers.length === 0 &&
    !activeSlug &&
    !searchForFilter &&
    (locale === 'zh' ? '本站暂无在售商品。' : 'No active offers yet for this site.')

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10 xl:gap-12">
      <aside className="w-full shrink-0 lg:w-80">
        <div className="rounded-xl border-2 border-border bg-card p-4 sm:p-5">
          {isMobile ? (
            <Collapsible open={mobileCatOpen} onOpenChange={setMobileCatOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg py-2 text-left font-semibold text-foreground">
                {locale === 'zh' ? '分类' : 'Categories'}
                <ChevronDown className={`h-4 w-4 transition-transform ${mobileCatOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">{sidebarInner}</CollapsibleContent>
            </Collapsible>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {locale === 'zh' ? '分类' : 'Categories'}
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
              placeholder={locale === 'zh' ? '搜索商品…' : 'Search products…'}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
            <p className="text-muted-foreground">
              {emptyNoData || (locale === 'zh' ? '未找到商品' : 'No products found')}
            </p>
            {!emptyNoData ? (
              <button
                type="button"
                className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setLocalSearch('')
                  replaceQuery(null, '')
                }}
              >
                {locale === 'zh' ? '清除筛选' : 'Clear filters'}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {filtered.map((o) => (
              <li key={o.id}>
                <AmzOfferCard offer={o} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
