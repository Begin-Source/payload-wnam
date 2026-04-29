import Link from 'next/link'
import React from 'react'

import type { AppLocale } from '@/i18n/config'
import type { Category } from '@/payload-types'

type Props = {
  locale: AppLocale
  homeLabel: string
  category: Category | null
  currentTitle: string | null | undefined
}

export function ArticleBreadcrumbs({ locale, homeLabel, category, currentTitle }: Props) {
  const title = (currentTitle ?? '').trim() || '—'
  return (
    <nav className="blogBreadcrumbs" aria-label="Breadcrumb">
      <ol className="blogBreadcrumbsList">
        <li>
          <Link href={`/${locale}`}>{homeLabel}</Link>
        </li>
        {category ? (
          <>
            <li className="blogBreadcrumbsSep" aria-hidden>
              /
            </li>
            <li>
              <Link href={`/${locale}/categories/${encodeURIComponent(category.slug)}`}>
                {category.name}
              </Link>
            </li>
          </>
        ) : null}
        <li className="blogBreadcrumbsSep" aria-hidden>
          /
        </li>
        <li className="blogBreadcrumbsCurrent" aria-current="page">
          <span>{title}</span>
        </li>
      </ol>
    </nav>
  )
}
