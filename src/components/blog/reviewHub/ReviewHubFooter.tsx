import Link from 'next/link'
import React from 'react'

import { resolveReviewHubFooterHref } from '@/components/blog/reviewHub/resolveFooterHref'
import type { Category } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

type Props = {
  theme: PublicSiteTheme
  categories: Category[]
  locale: AppLocale
}

export function ReviewHubFooter(props: Props) {
  const { theme, categories, locale } = props
  const prefix = `/${locale}`
  const year = new Date().getFullYear()
  const copyright = theme.footerLine
    ? theme.footerLine
    : `© ${year} ${theme.siteName}. All rights reserved.`

  return (
    <>
      <div className="reviewHubDisclosure" role="note">
        <p>{theme.affiliateDisclosureResolved}</p>
      </div>
      <footer className="reviewHubFooter">
        <div className="reviewHubFooterInner">
          <div className="reviewHubFooterCol">
            <h3 className="reviewHubFooterTitle">Categories</h3>
            {categories.length === 0 ? (
              <p style={{ fontSize: '0.9rem', opacity: 0.85, margin: 0 }}>—</p>
            ) : (
              <ul>
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`${prefix}/categories/${encodeURIComponent(c.slug)}`}
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="reviewHubFooterCol">
            <h3 className="reviewHubFooterTitle">Resources</h3>
            {theme.footerResourceLinks.length === 0 ? (
              <p style={{ fontSize: '0.9rem', opacity: 0.85, margin: 0 }}>
                Add links in Admin → Site → 联盟测评站.
              </p>
            ) : (
              <ul>
                {theme.footerResourceLinks.map((l) => (
                  <li key={`${l.href}-${l.label}`}>
                    <Link href={resolveReviewHubFooterHref(l.href, locale)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="reviewHubFooterCopy">
          <p>{copyright}</p>
        </div>
      </footer>
    </>
  )
}
