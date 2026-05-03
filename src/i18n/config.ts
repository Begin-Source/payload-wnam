import {
  getLocaleRegistryEntry,
  isRegisteredLocaleCode,
  localeCodesList,
  type RegistryLocaleCode,
} from '@/i18n/localeRegistry'

/** URL segment + stored `locale` on articles/pages (short codes). */
export const locales = localeCodesList

export type AppLocale = RegistryLocaleCode

/** Platform fallback when site / API resolution fails (middleware, seeds, CLI). */
export const defaultLocale: AppLocale = 'en'

export function isAppLocale(value: string): value is AppLocale {
  return isRegisteredLocaleCode(value)
}

export function htmlLangForLocale(locale: AppLocale): string {
  return getLocaleRegistryEntry(locale)?.htmlLang ?? locale
}

export function hreflangTagForLocale(locale: AppLocale): string {
  return getLocaleRegistryEntry(locale)?.hreflang ?? locale
}

/**
 * hreflang `x-default`: prefer the site/platform default when that translation exists;
 * otherwise the first available locale with content (by registry order).
 */
export function hreflangXDefaultUrl(
  baseUrl: string,
  pathAfterLocale: string,
  hasByLocale: Partial<Record<AppLocale, boolean>>,
  preferLocale: AppLocale = defaultLocale,
): string | null {
  if (!locales.some((loc) => hasByLocale[loc])) return null

  if (hasByLocale[preferLocale]) {
    return `${baseUrl}/${preferLocale}/${pathAfterLocale}`
  }
  for (const loc of locales) {
    if (hasByLocale[loc]) return `${baseUrl}/${loc}/${pathAfterLocale}`
  }
  return null
}
