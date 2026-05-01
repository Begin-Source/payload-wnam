import type { AppLocale } from '@/i18n/config'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'
import type { Category, Site } from '@/payload-types'
import type { ReactNode } from 'react'

/** Props passed from `[locale]/(frontend)/layout.tsx` into each layout’s `Shell`. */
export type SiteLayoutShellProps = {
  children: ReactNode
  locale: AppLocale
  site: Site | null
  theme: PublicSiteTheme
  categories: Category[]
  /** Payload admin URL for header links (blog / review-hub). */
  adminHref: string
}

export type SiteLayoutShellComponent = (
  props: SiteLayoutShellProps,
) => Promise<JSX.Element> | JSX.Element

export type SiteLayoutFontClasses = {
  interClassName: string
  interVariable: string
  merriweatherVariable: string
  notoSansScClassName: string
}
