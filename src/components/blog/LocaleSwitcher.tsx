'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

import { type AppLocale, locales } from '@/i18n/config'

type Props = {
  active: AppLocale
}

/** Keeps path after `/{locale}` when switching language (e.g. post detail). */
export function LocaleSwitcher(props: Props) {
  const { active } = props
  const pathname = usePathname() || '/'
  const segments = pathname.split('/').filter(Boolean)
  const tail = segments.slice(1)
  const suffix = tail.length ? `/${tail.join('/')}` : ''

  return (
    <>
      {locales.map((loc) => (
        <li key={loc}>
          <Link
            href={`/${loc}${suffix}`}
            hrefLang={loc === 'zh' ? 'zh-CN' : 'en'}
            aria-current={loc === active ? 'true' : undefined}
          >
            {loc === 'zh' ? '中文' : 'EN'}
          </Link>
        </li>
      ))}
    </>
  )
}
