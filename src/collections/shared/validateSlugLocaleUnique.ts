import type { CollectionBeforeChangeHook } from 'payload'

function siteIdFromData(site: unknown): number | null {
  if (site == null) return null
  if (typeof site === 'number' && !Number.isNaN(site)) return site
  if (typeof site === 'object' && site !== null && 'id' in site) {
    const id = (site as { id: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

export function validateSlugLocaleUnique(collection: 'articles' | 'pages'): CollectionBeforeChangeHook {
  return async ({ data, req, originalDoc }) => {
    const slug = typeof data.slug === 'string' ? data.slug.trim() : ''
    const locale = typeof data.locale === 'string' ? data.locale : 'zh'
    const siteId = siteIdFromData(data.site)
    if (!slug || siteId == null) return

    const payload = req.payload
    const andClause: unknown[] = [
      { slug: { equals: slug } },
      { locale: { equals: locale } },
      { site: { equals: siteId } },
    ]
    if (originalDoc?.id != null) {
      andClause.push({ id: { not_equals: originalDoc.id } })
    }

    const res = await payload.find({
      collection,
      where: { and: andClause as never },
      limit: 1,
      depth: 0,
    })
    if (res.docs.length > 0) {
      throw new Error(`Slug "${slug}" is already used for this site and locale (${locale}).`)
    }
  }
}
