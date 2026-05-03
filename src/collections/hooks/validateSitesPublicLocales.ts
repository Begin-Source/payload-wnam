import type { CollectionBeforeChangeHook } from 'payload'

import { defaultLocale, isAppLocale } from '@/i18n/config'

/** Ensure sites always have at least one public locale and a valid default. */
export const validateSitesPublicLocales: CollectionBeforeChangeHook = ({ data }) => {
  let codes = data.publicLocaleCodes
  if (!Array.isArray(codes)) codes = ['zh', 'en']
  const normalized = codes.filter(
    (c): c is string => typeof c === 'string' && isAppLocale(c.trim()),
  )
  const unique = [...new Set(normalized.map((c) => c.trim()))]
  data.publicLocaleCodes = unique.length > 0 ? unique : ['zh', 'en']

  const enabled = data.publicLocaleCodes as string[]
  let def = typeof data.defaultPublicLocale === 'string' ? data.defaultPublicLocale.trim() : ''
  if (!def || !isAppLocale(def) || !enabled.includes(def)) {
    def = enabled.includes(defaultLocale) ? defaultLocale : enabled[0]!
    data.defaultPublicLocale = def
  }
}
