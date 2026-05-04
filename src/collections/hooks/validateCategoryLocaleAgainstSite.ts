import type { CollectionBeforeChangeHook } from 'payload'

import { isAppLocale, type AppLocale } from '@/i18n/config'
import { hasRelationshipId } from '@/utilities/parseRelationshipId'
import { normalizeSitePublicLocales } from '@/utilities/sitePublicLocales'

/** `categories.locale` must be a registered code; if `site` is set, must be in that site's public locales. */
export const validateCategoryLocaleAgainstSite: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
}) => {
  const locRaw =
    data.locale !== undefined && data.locale !== null
      ? String(data.locale).trim()
      : String((originalDoc as { locale?: string } | undefined)?.locale ?? '').trim()
  if (!locRaw) {
    throw new Error('分类须选择前台语言 locale。')
  }
  if (!isAppLocale(locRaw)) {
    throw new Error(`无效的 locale: ${locRaw}`)
  }
  const sitePayload = data.site !== undefined ? data.site : (originalDoc as { site?: unknown })?.site
  if (!hasRelationshipId(sitePayload)) return data

  const siteId =
    typeof sitePayload === 'number'
      ? sitePayload
      : typeof sitePayload === 'object' &&
          sitePayload !== null &&
          'id' in sitePayload &&
          typeof (sitePayload as { id: unknown }).id === 'number'
        ? (sitePayload as { id: number }).id
        : null
  if (siteId == null) return data

  const site = await req.payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })
  const { publicLocales } = normalizeSitePublicLocales(site)
  if (!publicLocales.includes(locRaw as AppLocale)) {
    throw new Error(
      `分类 locale「${locRaw}」未在该站点「前台启用语言」中。已启用：${publicLocales.join(', ')}。`,
    )
  }

  return data
}
