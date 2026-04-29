import type { AppLocale } from '@/i18n/config'

/** Relative links without leading slash are scoped to the active locale prefix. */
export function resolveReviewHubFooterHref(href: string, locale: AppLocale): string {
  const t = href.trim()
  if (!t) return '#'
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/')) return t
  return `/${locale}/${t.replace(/^\/+/, '')}`
}
