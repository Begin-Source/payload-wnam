'use client'

import { Search, Menu, X } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { appendAmzSite } from '@/site-layouts/amz-template-1/appendAmzSite'
import { AmzLink } from '@/site-layouts/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/site-layouts/amz-template-1/amzNavHref'
import { Button } from '@/site-layouts/amz-template-1/components/ui/button'
import { Input } from '@/site-layouts/amz-template-1/components/ui/input'
import type { AppLocale } from '@/i18n/config'

export function AmzSiteHeader({ locale, config }: { locale: AppLocale; config: AmzSiteConfig }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      const base = amzNavHref(locale, '/search')
      const url = `${base}?q=${encodeURIComponent(searchQuery.trim())}`
      router.push(appendAmzSite(url, searchParams?.get('site')))
      setSearchOpen(false)
      setSearchQuery('')
    }
  }

  const { logo: brandLogoMark } = config.brand
  const rasterLogoMark =
    brandLogoMark.type === 'image' &&
    typeof brandLogoMark.imagePath === 'string' &&
    !!brandLogoMark.imagePath.trim()

  const renderLogo = () => {
    const { logo } = config.brand
    const logoType = logo.type as 'lucide' | 'svg' | 'image'

    if (logoType === 'lucide' && logo.icon) {
      const IconComponent = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[
        logo.icon
      ]
      if (IconComponent) {
        return <IconComponent className="h-6 w-6 text-primary-foreground" />
      }
    }

    if (logoType === 'svg' && logo.svgPath) {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-primary-foreground"
        >
          <path d={logo.svgPath} />
        </svg>
      )
    }

    if (logoType === 'image' && logo.imagePath) {
      return (
        // CDN / tenant R2 URLs; avoid next/image remotePatterns drift for brand mark
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo.imagePath}
          alt={config.brand.name}
          className="block size-full max-h-10 max-w-10 object-contain"
          decoding="async"
        />
      )
    }

    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-primary-foreground"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center">
          <div className="flex flex-1 flex-shrink-0 lg:flex-1">
            <AmzLink href={amzNavHref(locale, '/')} className="flex items-center gap-2">
              <div
                className={
                  rasterLogoMark
                    ? 'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg'
                    : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary'
                }
              >
                {renderLogo()}
              </div>
              <div className="hidden sm:block">
                <span className="text-lg font-bold text-foreground">{config.brand.name}</span>
              </div>
            </AmzLink>
          </div>

          <nav className="hidden flex-shrink-0 items-center gap-1 lg:flex">
            {config.navigation.main.map((item) => (
              <AmzLink
                key={item.href}
                href={amzNavHref(locale, item.href)}
                className="px-4 py-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                {item.label}
              </AmzLink>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-foreground hover:text-primary"
            >
              <Search className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="text-foreground hover:text-primary lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {searchOpen ? (
          <div className="animate-in slide-in-from-top-2 border-t border-border py-4 duration-200">
            <form onSubmit={handleSearch} className="relative mx-auto max-w-2xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder={config.homepage.hero.searchPlaceholder}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </form>
          </div>
        ) : null}

        {mobileMenuOpen ? (
          <div className="animate-in slide-in-from-top-2 border-t border-border py-4 duration-200 lg:hidden">
            <nav className="flex flex-col gap-4">
              {config.navigation.main.map((item) => (
                <AmzLink
                  key={item.href}
                  href={amzNavHref(locale, item.href)}
                  className="font-semibold text-foreground transition-colors hover:text-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </AmzLink>
              ))}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  )
}
