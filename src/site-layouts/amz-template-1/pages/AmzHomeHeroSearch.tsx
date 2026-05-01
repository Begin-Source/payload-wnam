'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { appendAmzSite } from '@/site-layouts/amz-template-1/appendAmzSite'
import { Button } from '@/site-layouts/amz-template-1/components/ui/button'
import { Input } from '@/site-layouts/amz-template-1/components/ui/input'
import { amzNavHref } from '@/site-layouts/amz-template-1/amzNavHref'
import type { AppLocale } from '@/i18n/config'

/**
 * `hero`: same pattern as `amz-template-old` home hero (icon + Input + accent Search button).
 * `pill`: compact rounded bar for secondary pages.
 */
export function AmzHomeHeroSearch({
  locale,
  placeholder,
  initialQuery,
  layout = 'pill',
}: {
  locale: AppLocale
  placeholder: string
  initialQuery?: string
  layout?: 'hero' | 'pill'
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
    if (layout === 'hero') {
      setQ('')
    }
  }

  if (layout === 'hero') {
    return (
      <form onSubmit={onSubmit} className="relative mx-auto max-w-2xl">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          className="h-14 bg-background pl-12 pr-[7.5rem] text-base text-foreground md:text-base"
        />
        <Button
          type="submit"
          size="lg"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Search
        </Button>
      </form>
    )
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
