import { defaultLocale, type AppLocale, isAppLocale } from '@/i18n/config'

/**
 * Prefer `locale`, then `siteDefaultLocale`, then `getLocalizedString`’s built-in chain.
 */
export function pickUiString(
  locale: AppLocale,
  siteDefaultLocale: AppLocale,
  map: Partial<Record<AppLocale, string>>,
): string {
  return getLocalizedString(map, locale, siteDefaultLocale)
}

/** Replace `{key}` placeholders (ASCII keys only). */
export function applyUiTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) continue
    out = out.split(`{${k}}`).join(String(v))
  }
  return out
}

/**
 * First matching non-empty string from `map` using `locale`, optional fallbacks,
 * then `defaultLocale`, then `en`.
 */
export function getLocalizedString(
  map: Partial<Record<AppLocale, string>>,
  locale: string | undefined | null,
  ...moreFallbackLocales: (AppLocale | undefined | null)[]
): string {
  const order: AppLocale[] = []
  if (locale && isAppLocale(locale)) order.push(locale)
  for (const x of moreFallbackLocales) {
    if (x && isAppLocale(x) && !order.includes(x)) order.push(x)
  }
  if (!order.includes(defaultLocale)) order.push(defaultLocale)
  if (!order.includes('en')) order.push('en')
  for (const key of [...new Set(order)]) {
    const v = map[key]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return ''
}

/** `zh` and `zh-*` use the Chinese copy branch. */
export function localeUsesChineseCopy(locale: string | AppLocale): boolean {
  const s = typeof locale === 'string' ? locale.toLowerCase() : String(locale).toLowerCase()
  return s === 'zh' || s.startsWith('zh-')
}

/** Narrow zh vs en UI strings; other public locales use the English branch. */
export function zhEnUi(locale: string | AppLocale, zh: string, en: string): string {
  return localeUsesChineseCopy(locale) ? zh : en
}

/** Pick one structured copy block (e.g. `copy.zh` vs `copy.en`). */
export function zhEnPick<T>(locale: string | AppLocale, zh: T, en: T): T {
  return localeUsesChineseCopy(locale) ? zh : en
}
