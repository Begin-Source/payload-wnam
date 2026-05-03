'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

import { hreflangTagForLocale, locales as allLocales, type AppLocale } from '@/i18n/config'
import { getLocaleRegistryEntry } from '@/i18n/localeRegistry'

type Props = {
  active: AppLocale
  /** When set, only these languages are linked (must match site `publicLocales`). */
  enabledLocales?: readonly AppLocale[]
}

/** Keeps path after `/{locale}` when switching language (e.g. post detail). */
export function LocaleSwitcher(props: Props) {
  const { active, enabledLocales } = props
  const pathname = usePathname() || '/'
  const segments = pathname.split('/').filter(Boolean)
  const tail = segments.slice(1)
  const suffix = tail.length ? `/${tail.join('/')}` : ''
  const list = enabledLocales?.length ? [...enabledLocales] : [...allLocales]

  return (
    <>
      {list.map((loc) => (
        <li key={loc}>
          <Link
            href={`/${loc}${suffix}`}
            hrefLang={hreflangTagForLocale(loc)}
            aria-current={loc === active ? 'true' : undefined}
          >
            {getLocaleRegistryEntry(loc)?.label ?? loc.toUpperCase()}
          </Link>
        </li>
      ))}
    </>
  )
}
