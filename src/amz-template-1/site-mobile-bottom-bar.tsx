'use client'

import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import { amzNavHref } from '@/amz-template-1/amzNavHref'
import { cn } from '@/amz-template-1/lib/utils'
import type { AppLocale } from '@/i18n/config'

/** Locale-prefixed paths: hide bar on `/[locale]/reviews` only (matches amz behavior for listing). */
export function amzShouldShowGlobalMobileBar(pathname: string | null): boolean {
  if (!pathname) return false
  if (/\/reviews\/?$/.test(pathname)) return false
  if (/\/review\/[^/]+$/.test(pathname)) return false
  if (/\/guides\/[^/]+$/.test(pathname)) return false
  return true
}

export function AmzSiteMobileLayoutPad({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const pad = amzShouldShowGlobalMobileBar(pathname)
  return <div className={cn('flex min-w-0 flex-1 flex-col', pad && 'pb-24 lg:pb-0')}>{children}</div>
}

export function AmzSiteMobileBottomBar({ locale }: { locale: AppLocale }) {
  const pathname = usePathname()
  if (!amzShouldShowGlobalMobileBar(pathname)) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[#FF9900] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] lg:hidden">
      <AmzLink
        href={amzNavHref(locale, '/reviews')}
        className="flex min-h-14 w-full items-center justify-center gap-2 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#FF9900]/90"
      >
        Product Reviews
        <ExternalLink className="h-4 w-4 shrink-0" />
      </AmzLink>
    </div>
  )
}
