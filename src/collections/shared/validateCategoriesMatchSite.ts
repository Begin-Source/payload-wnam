import type { CollectionBeforeChangeHook } from 'payload'

import { isAppLocale } from '@/i18n/config'

/**
 * 分类若绑定站点，则须与文章/页面的 site 一致；未绑定站点的分类可任意搭配。
 */
export const validateCategoriesMatchSite: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
}) => {
  const payload = req.payload

  const siteRaw =
    data.site !== undefined ? data.site : (originalDoc as { site?: unknown } | undefined)?.site
  const articleSiteId =
    siteRaw == null
      ? null
      : typeof siteRaw === 'number'
        ? siteRaw
        : typeof siteRaw === 'object' &&
            siteRaw !== null &&
            'id' in siteRaw &&
            typeof (siteRaw as { id: unknown }).id === 'number'
          ? (siteRaw as { id: number }).id
          : null

  const catsRaw =
    data.categories !== undefined
      ? data.categories
      : (originalDoc as { categories?: unknown } | undefined)?.categories

  if (!catsRaw || !Array.isArray(catsRaw) || catsRaw.length === 0) {
    return data
  }

  const ids: number[] = []
  for (const c of catsRaw) {
    if (typeof c === 'number') ids.push(c)
    else if (typeof c === 'object' && c !== null && 'id' in c && typeof (c as { id: unknown }).id === 'number') {
      ids.push((c as { id: number }).id)
    }
  }

  const docLocaleRaw =
    data.locale !== undefined ? data.locale : (originalDoc as { locale?: unknown } | undefined)?.locale
  const docLocale = typeof docLocaleRaw === 'string' ? docLocaleRaw.trim() : ''

  for (const cid of ids) {
    const cat = await payload.findByID({
      collection: 'categories',
      id: cid,
      depth: 0,
    })
    if (!cat) continue
    const catLocaleRaw = (cat as { locale?: unknown }).locale
    const catLocale = typeof catLocaleRaw === 'string' ? catLocaleRaw.trim() : ''
    if (catLocale && docLocale && isAppLocale(docLocale) && catLocale !== docLocale) {
      const catName = typeof (cat as { name?: unknown }).name === 'string' ? (cat as { name: string }).name : String(cid)
      throw new Error(
        `分类「${catName}」的语言为「${catLocale}」，与当前文档语言「${docLocale}」不一致，请换用同语言的分类或更改文档语言。`,
      )
    }
    const catSiteRaw = cat.site
    const catSiteId =
      catSiteRaw == null
        ? null
        : typeof catSiteRaw === 'number'
          ? catSiteRaw
          : typeof catSiteRaw === 'object' && 'id' in catSiteRaw
            ? (catSiteRaw as { id: number }).id
            : null
    if (catSiteId == null) continue
    if (articleSiteId == null) {
      throw new Error('请先选择站点，再使用已绑定站点的分类')
    }
    if (catSiteId !== articleSiteId) {
      throw new Error('所选分类与当前站点不一致')
    }
  }

  return data
}
