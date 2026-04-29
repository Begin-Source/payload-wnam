import Link from 'next/link'
import React from 'react'

import { LocaleSwitcher } from '@/components/blog/LocaleSwitcher'
import type { Category } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

type Props = {
  theme: PublicSiteTheme
  categories: Category[]
  adminHref: string
  locale: AppLocale
}

export function ReviewHubHeader(props: Props) {
  const { theme, categories, adminHref, locale } = props
  const prefix = `/${locale}`

  return (
    <header className="reviewHubHeader">
      <div className="reviewHubHeaderTop">
        <div className="reviewHubHeaderInner">
          <Link className="reviewHubBrand" href={prefix}>
            {theme.siteName}
          </Link>
          <nav className="reviewHubTopNav" aria-label="Language and site tools">
            <ul className="reviewHubTopNavList">
              <LocaleSwitcher active={locale} />
              <li>
                <a
                  className="reviewHubAdminCta"
                  href={adminHref}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {theme.ctaLabel}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      <div className="reviewHubHeaderNavWrap">
        <div className="reviewHubHeaderInner">
          <nav className="reviewHubMainNav" aria-label="Main">
            <Link href={prefix}>Home</Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`${prefix}/categories/${encodeURIComponent(c.slug)}`}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
