/** Platform-supported URL segment + CMS / SEO metadata. Add new languages here, then deploy. */
export const LOCALE_REGISTRY = [
  { code: 'en', label: 'English', hreflang: 'en', htmlLang: 'en' },
  { code: 'zh', label: '中文', hreflang: 'zh-CN', htmlLang: 'zh-CN' },
  { code: 'es', label: 'Español', hreflang: 'es', htmlLang: 'es' },
  { code: 'pt', label: 'Português', hreflang: 'pt-BR', htmlLang: 'pt-BR' },
  { code: 'fr', label: 'Français', hreflang: 'fr', htmlLang: 'fr' },
  { code: 'de', label: 'Deutsch', hreflang: 'de', htmlLang: 'de' },
  { code: 'it', label: 'Italiano', hreflang: 'it', htmlLang: 'it' },
  { code: 'ja', label: '日本語', hreflang: 'ja', htmlLang: 'ja' },
  { code: 'ko', label: '한국어', hreflang: 'ko', htmlLang: 'ko' },
  { code: 'nl', label: 'Nederlands', hreflang: 'nl', htmlLang: 'nl' },
  { code: 'pl', label: 'Polski', hreflang: 'pl', htmlLang: 'pl' },
  { code: 'tr', label: 'Türkçe', hreflang: 'tr', htmlLang: 'tr' },
  { code: 'ar', label: 'العربية', hreflang: 'ar', htmlLang: 'ar' },
  { code: 'hi', label: 'हिन्दी', hreflang: 'hi', htmlLang: 'hi' },
  { code: 'vi', label: 'Tiếng Việt', hreflang: 'vi', htmlLang: 'vi' },
  { code: 'th', label: 'ไทย', hreflang: 'th', htmlLang: 'th' },
  { code: 'id', label: 'Bahasa Indonesia', hreflang: 'id', htmlLang: 'id' },
  { code: 'ms', label: 'Bahasa Melayu', hreflang: 'ms', htmlLang: 'ms' },
  { code: 'uk', label: 'Українська', hreflang: 'uk', htmlLang: 'uk' },
  { code: 'ru', label: 'Русский', hreflang: 'ru', htmlLang: 'ru' },
] as const

export type LocaleRegistryEntry = (typeof LOCALE_REGISTRY)[number]

export type RegistryLocaleCode = LocaleRegistryEntry['code']

const codesOrdered = LOCALE_REGISTRY.map((e) => e.code)

const entryByCode = new Map<string, LocaleRegistryEntry>(
  LOCALE_REGISTRY.map((e) => [e.code, e]),
)

export const localeCodesList: readonly RegistryLocaleCode[] = codesOrdered

export function getLocaleRegistryEntry(code: string): LocaleRegistryEntry | undefined {
  return entryByCode.get(code)
}

/** Payload `select` options (sites + post locale). */
export const localeSelectOptions = LOCALE_REGISTRY.map((e) => ({
  label: e.label,
  value: e.code,
}))

export function isRegisteredLocaleCode(value: string): value is RegistryLocaleCode {
  return entryByCode.has(value)
}
