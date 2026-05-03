import Link from 'next/link'
import React from 'react'

import type { Category } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

import { LocaleSwitcher } from '@/components/blog/LocaleSwitcher'

type Props = {
  theme: PublicSiteTheme
  categories: Category[]
  adminHref: string
  locale: AppLocale
}

export function BlogHeader(props: Props) {
  const { theme, categories, adminHref, locale } = props
  const prefix = `/${locale}`

  return (
    <header className="blogHeader">
      <div className="blogHeaderInner">
        <Link className="blogBrand" href={prefix}>
          {theme.siteName}
        </Link>
        <nav aria-label="Main">
          <ul className="blogNav">
            <li>
              <Link href={prefix}>Home</Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`${prefix}/categories/${encodeURIComponent(c.slug)}`}>{c.name}</Link>
              </li>
            ))}
            <LocaleSwitcher active={locale} enabledLocales={theme.publicLocales} />
            <li className="blogNavAdmin">
              <a href={adminHref} rel="noopener noreferrer" target="_blank">
                {theme.ctaLabel}
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
