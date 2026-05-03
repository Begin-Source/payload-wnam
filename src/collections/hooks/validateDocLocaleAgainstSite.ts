import type { CollectionBeforeChangeHook } from 'payload'

import { isAppLocale, type AppLocale } from '@/i18n/config'
import { normalizeSitePublicLocales } from '@/utilities/sitePublicLocales'

function siteIdFromData(site: unknown): number | null {
  if (site == null) return null
  if (typeof site === 'number' && !Number.isNaN(site)) return site
  if (typeof site === 'object' && site !== null && 'id' in site) {
    const id = (site as { id: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

/** When `site` is set, `locale` must be in that site's `publicLocaleCodes`. */
export const validateDocLocaleAgainstSite: CollectionBeforeChangeHook = async ({ data, req }) => {
  const siteId = siteIdFromData(data.site)
  const loc = typeof data.locale === 'string' ? data.locale.trim() : ''
  if (siteId == null || !loc || !isAppLocale(loc)) return

  const site = await req.payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })
  const { publicLocales } = normalizeSitePublicLocales(site)
  if (!publicLocales.includes(loc as AppLocale)) {
    throw new Error(
      `Locale "${loc}" is not enabled for this site. Enabled: ${publicLocales.join(', ')}.`,
    )
  }
}
