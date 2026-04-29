'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { appendAmzSite } from '@/amz-template-1/appendAmzSite'
import { amzNavHref } from '@/amz-template-1/amzNavHref'
import type { AppLocale } from '@/i18n/config'

/**
 * Demo-style single white pill: icon + input + red Search, one shadowed bar on dark hero.
 */
export function AmzHomeHeroSearch({
  locale,
  placeholder,
  initialQuery,
}: {
  locale: AppLocale
  placeholder: string
  /** Sync input with URL `?q=` on the search page (read-only mirror from server). */
  initialQuery?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(initialQuery ?? '')

  useEffect(() => {
    setQ(initialQuery ?? '')
  }, [initialQuery])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (!term) return
    const base = amzNavHref(locale, '/search')
    router.push(appendAmzSite(`${base}?q=${encodeURIComponent(term)}`, searchParams?.get('site')))
    setQ('')
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-10 w-full max-w-2xl">
      <div className="flex min-h-[3.25rem] items-stretch overflow-hidden rounded-full border border-black/[0.06] bg-white pl-4 shadow-lg ring-1 ring-black/[0.04] sm:pl-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-2">
          <Search aria-hidden className="size-5 shrink-0 text-neutral-400" />
          <input
            type="search"
            name="q"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0 md:text-[17px]"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-none bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-700 sm:px-8 sm:text-base"
        >
          Search
        </button>
      </div>
    </form>
  )
}
