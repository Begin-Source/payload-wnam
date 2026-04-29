'use client'

import { ChevronDown, Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/template1/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/template1/ui/dropdown-menu'
import type { AppLocale } from '@/i18n/config'
import type { Category } from '@/payload-types'

export type Template1HeaderProps = {
  locale: AppLocale
  siteName: string
  /** Short label for logo block (e.g. first letters) */
  siteInitials: string
  categories: Category[]
  /** en/zh copy for nav */
  labels: {
    allReviews: string
    categories: string
    about: string
    searchSr: string
    menuSr: string
  }
}

export function Template1Header(props: Template1HeaderProps) {
  const { locale, siteName, siteInitials, categories, labels } = props
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const home = `/${locale}`
  const about = `/${locale}/about`

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href={home} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
              <span className="text-xs font-bold tracking-tight text-primary-foreground">{siteInitials}</span>
            </div>
            <span className="font-serif text-lg font-bold tracking-tight text-foreground">{siteName}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href={home}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {labels.allReviews}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground">
                {labels.categories}
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {categories.map((cat) => (
                  <DropdownMenuItem key={cat.id} asChild>
                    <Link href={`/${locale}/categories/${encodeURIComponent(cat.slug)}`}>{cat.name}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link
              href={about}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {labels.about}
            </Link>
          </nav>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" asChild>
              <Link href={home} aria-label={labels.searchSr}>
                <Search className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={labels.menuSr}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-border py-3 md:hidden">
            <div className="flex flex-col gap-1">
              <Link
                href={home}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                {labels.allReviews}
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/${locale}/categories/${encodeURIComponent(cat.slug)}`}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {cat.name}
                </Link>
              ))}
              <Link
                href={about}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                {labels.about}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
