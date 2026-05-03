import { defaultLocale, isAppLocale, locales, type AppLocale } from '@/i18n/config'

type SiteLocaleFields = {
  publicLocaleCodes?: unknown
  defaultPublicLocale?: string | null
}

/** Ordered enabled locales for a site; falls back to full platform list if unset (legacy rows). */
export function normalizeSitePublicLocales(
  site: SiteLocaleFields | null | undefined,
): { publicLocales: AppLocale[]; defaultPublicLocale: AppLocale } {
  const raw = site?.publicLocaleCodes
  const picked = new Set<AppLocale>()
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && isAppLocale(item)) picked.add(item)
    }
  }

  let publicLocales = locales.filter((l) => picked.has(l))
  if (publicLocales.length === 0) {
    publicLocales = [...locales]
  }

  let def =
    typeof site?.defaultPublicLocale === 'string' && isAppLocale(site.defaultPublicLocale)
      ? site.defaultPublicLocale
      : defaultLocale
  if (!publicLocales.includes(def)) {
    def = publicLocales.includes(defaultLocale) ? defaultLocale : publicLocales[0]!
  }

  return { publicLocales, defaultPublicLocale: def }
}
