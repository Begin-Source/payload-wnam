import type { CollectionBeforeChangeHook } from 'payload'

function siteIdFromData(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    return siteIdFromData((raw as { id: unknown }).id)
  }
  return null
}

function authorRelationId(raw: unknown): number | string | null {
  if (raw == null) return null
  if (typeof raw === 'string' || typeof raw === 'number') return raw
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

function siteIdsFromAuthorSites(sites: unknown): number[] {
  if (!Array.isArray(sites)) return []
  const out: number[] = []
  for (const s of sites) {
    const id = siteIdFromData(s)
    if (id != null) out.push(id)
  }
  return out
}

/** Ensures article `author` / `reviewedBy` are assigned to the article's `site` via `authors.sites`. */
export const articleAuthorsBelongToSite: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const siteRaw = data.site !== undefined ? data.site : originalDoc?.site
  const siteId = siteIdFromData(siteRaw)
  if (siteId == null) return

  const ensure = async (field: 'author' | 'reviewedBy', label: string) => {
    const raw = data[field] !== undefined ? data[field] : (originalDoc as { author?: unknown; reviewedBy?: unknown } | null)?.[field]
    const aid = authorRelationId(raw)
    if (aid == null) return

    const author = await req.payload.findByID({
      collection: 'authors',
      id: aid,
      depth: 0,
      req,
      overrideAccess: true,
    })
    const authorSites = siteIdsFromAuthorSites(author.sites)
    if (!authorSites.includes(siteId)) {
      throw new Error(
        `${label} must be an author assigned to this article's site (edit the author's "Sites" field to include this site).`,
      )
    }
  }

  await ensure('author', 'Author')
  await ensure('reviewedBy', 'Reviewed by')
}
