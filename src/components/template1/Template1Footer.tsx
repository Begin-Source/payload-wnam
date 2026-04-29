import Link from 'next/link'

import type { AppLocale } from '@/i18n/config'
import type { Category } from '@/payload-types'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

export type Template1FooterProps = {
  locale: AppLocale
  theme: PublicSiteTheme
  categories: Category[]
  labels: {
    categoriesHeading: string
    companyHeading: string
    affiliateDisclosure: string
    /** Fully resolved one-line copyright, e.g. "© 2026 Name. All rights reserved." */
    copyrightLine: string
    /** Bottom fine print. */
    bottomLine: string
  }
  companyLinks: { label: string; href: string }[]
}

function initialsFromName(name: string, max = 2): string {
  const t = name.trim()
  if (!t) return '·'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, max).toUpperCase()
  return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase()
}

export function Template1Footer(props: Template1FooterProps) {
  const { locale, theme, categories, labels, companyLinks } = props
  const home = `/${locale}`
  const siteName = theme.siteName
  const initials = initialsFromName(siteName)
  const disclosure = theme.affiliateDisclosureResolved

  return (
    <footer className="mt-16 bg-foreground text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="md:col-span-1">
            <Link href={home} className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
                <span className="text-xs font-bold text-primary-foreground">{initials}</span>
              </div>
              <span className="font-serif text-lg font-bold">{siteName}</span>
            </Link>
            {theme.tagline ? (
              <p className="text-sm leading-relaxed" style={{ color: 'oklch(0.75 0 0)' }}>
                {theme.tagline}
              </p>
            ) : null}
            <div
              className="mt-5 rounded border p-3"
              style={{ borderColor: 'oklch(0.35 0 0)', backgroundColor: 'oklch(0.22 0 0)' }}
            >
              <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.65 0 0)' }}>
                <span className="font-semibold" style={{ color: 'oklch(0.8 0 0)' }}>
                  {labels.affiliateDisclosure}{' '}
                </span>
                {disclosure}
              </p>
            </div>
          </div>

          <div>
            <h3
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'oklch(0.65 0 0)' }}
            >
              {labels.categoriesHeading}
            </h3>
            <ul className="space-y-2.5">
              {categories.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/${locale}/categories/${encodeURIComponent(item.slug)}`}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: 'oklch(0.7 0 0)' }}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'oklch(0.65 0 0)' }}
            >
              {labels.companyHeading}
            </h3>
            <ul className="space-y-2.5">
              {theme.footerResourceLinks.length > 0
                ? theme.footerResourceLinks.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className="text-sm transition-colors hover:text-white"
                        style={{ color: 'oklch(0.7 0 0)' }}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))
                : companyLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-sm transition-colors hover:text-white"
                        style={{ color: 'oklch(0.7 0 0)' }}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-8 sm:flex-row"
          style={{ borderColor: 'oklch(0.3 0 0)' }}
        >
          <p className="text-xs" style={{ color: 'oklch(0.55 0 0)' }}>
            {labels.copyrightLine}
          </p>
          <p className="text-xs" style={{ color: 'oklch(0.45 0 0)' }}>
            {labels.bottomLine}
          </p>
        </div>
      </div>
    </footer>
  )
}
