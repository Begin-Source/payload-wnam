import type { CollectionAfterChangeHook } from 'payload'

import { syncBodyLinksToGraph } from '@/services/linkgraph/ingest'

function siteIdOf(site: unknown): string | null {
  if (site == null) return null
  if (typeof site === 'string' || typeof site === 'number') return String(site)
  if (typeof site === 'object' && 'id' in site) return String((site as { id: unknown }).id)
  return null
}

/**
 * Keeps `page-link-graph` in sync with Lexical `body` for articles and pages (patch G).
 */
export const pageLinkGraphSync: CollectionAfterChangeHook = async ({ doc, req, collection }) => {
  try {
    const slug = collection?.slug
    if (slug !== 'articles' && slug !== 'pages') return

    const siteId = siteIdOf((doc as { site?: unknown }).site)
    if (!siteId) return

    const body = (doc as { body?: unknown }).body
    if (body == null) return

    const fromCollection = slug === 'articles' ? 'articles' : 'pages'
    await syncBodyLinksToGraph(req.payload, {
      siteId,
      fromCollection,
      fromId: String((doc as { id: string | number }).id),
      body,
      createdBy: `${slug}:linkgraph-sync`,
    })
  } catch {
    // Best-effort: never block saves on graph sync
  }
}
