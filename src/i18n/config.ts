/** URL segment + stored `locale` on articles/pages (short codes). */
export const locales = ['zh', 'en'] as const

export type AppLocale = (typeof locales)[number]

export const defaultLocale: AppLocale = 'en'

export function isAppLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value)
}

export function htmlLangForLocale(locale: AppLocale): string {
  return locale === 'zh' ? 'zh-CN' : 'en'
}

/**
 * hreflang `x-default`: prefer the default locale URL when that translation exists;
 * otherwise fall back to whichever locale has content.
 */
export function hreflangXDefaultUrl(
  baseUrl: string,
  pathAfterLocale: string,
  hasZh: boolean,
  hasEn: boolean,
): string | null {
  if (!hasZh && !hasEn) return null
  const locale: AppLocale =
    (defaultLocale === 'en' && hasEn) || (defaultLocale === 'zh' && hasZh)
      ? defaultLocale
      : hasEn
        ? 'en'
        : 'zh'
  return `${baseUrl}/${locale}/${pathAfterLocale}`
}
