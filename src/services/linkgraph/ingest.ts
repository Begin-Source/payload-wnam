import { createHash } from 'node:crypto'

import type { Payload } from 'payload'

/** One outbound edge from a Lexical `body` (Payload richtext-lexical link fields). */
export type LinkEdgeDraft = {
  fromCollection: string
  fromId: string
  toCollection: string
  toId: string
  toExternal?: string
  anchorText?: string
  location: string
}

function normalizeDocId(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  return ''
}

function extractTextUnderLink(children: unknown): string {
  const parts: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; text?: string; children?: unknown[] }
    if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.children)) for (const c of n.children) visit(c)
  }
  if (Array.isArray(children)) for (const c of children) visit(c)
  return parts.join('').trim()
}

function walkLexical(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== 'object') return
  const n = node as Record<string, unknown>
  visit(n)
  const children = n.children
  if (Array.isArray(children)) {
    for (const c of children) walkLexical(c, visit)
  }
}

function dedupeEdges(edges: LinkEdgeDraft[]): LinkEdgeDraft[] {
  const m = new Map<string, LinkEdgeDraft>()
  for (const e of edges) {
    m.set(edgeKey(e), e)
  }
  return [...m.values()]
}

function edgeKey(e: Pick<LinkEdgeDraft, 'toCollection' | 'toId' | 'anchorText' | 'location'>): string {
  return `${e.toCollection}\0${e.toId}\0${e.anchorText ?? ''}\0${e.location}`
}

/**
 * Walk Lexical JSON for `type: 'link'` nodes (Payload default link feature).
 * Internal links: `fields.doc = { relationTo, value }`. Custom links: `fields.url`.
 */
export function extractLinksFromLexical(
  lexical: unknown,
  ctx: { fromCollection: string; fromId: string; location?: string },
): LinkEdgeDraft[] {
  const location = ctx.location ?? 'body'
  const out: LinkEdgeDraft[] = []
  const root =
    lexical && typeof lexical === 'object' && 'root' in (lexical as object)
      ? (lexical as { root: unknown }).root
      : lexical

  walkLexical(root, (node) => {
    if (node.type !== 'link') return
    const fields = node.fields
    if (!fields || typeof fields !== 'object') return
    const f = fields as Record<string, unknown>
    const anchorText = extractTextUnderLink(node.children) || undefined

    const doc = f.doc
    if (doc && typeof doc === 'object') {
      const d = doc as Record<string, unknown>
      const relationTo = typeof d.relationTo === 'string' ? d.relationTo : ''
      const toId = normalizeDocId(d.value)
      if (relationTo && toId) {
        out.push({
          fromCollection: ctx.fromCollection,
          fromId: ctx.fromId,
          toCollection: relationTo,
          toId,
          anchorText,
          location,
        })
      }
      return
    }

    const url = typeof f.url === 'string' ? f.url.trim() : ''
    if (url.length > 0) {
      const toId = createHash('sha256').update(url).digest('hex').slice(0, 32)
      out.push({
        fromCollection: ctx.fromCollection,
        fromId: ctx.fromId,
        toCollection: 'external',
        toId,
        toExternal: url,
        anchorText,
        location,
      })
    }
  })

  return dedupeEdges(out)
}

export type SyncGraphResult = {
  inserted: number
  updated: number
  deleted: number
  edgeCount: number
}

function siteRef(siteId: string): number {
  return Number(siteId)
}

/**
 * Replace all `page-link-graph` rows for this `(site, from*, location)` with edges parsed from `body`.
 */
export async function syncBodyLinksToGraph(
  payload: Payload,
  args: {
    siteId: string
    fromCollection: 'articles' | 'pages'
    fromId: string
    body: unknown
    createdBy: string
    location?: string
  },
): Promise<SyncGraphResult> {
  const { siteId, fromCollection, fromId, body, createdBy, location = 'body' } = args
  const edges = extractLinksFromLexical(body, { fromCollection, fromId, location })
  const ref = siteRef(siteId)

  const existing = await payload.find({
    collection: 'page-link-graph',
    where: {
      and: [
        { site: { equals: ref } },
        { fromCollection: { equals: fromCollection } },
        { fromId: { equals: fromId } },
        { location: { equals: location } },
      ],
    },
    limit: 1000,
    depth: 0,
  })

  const now = new Date().toISOString()
  const stale = new Map<
    string,
    { id: string | number; toCollection: string; toId: string; anchorText?: string | null; location?: string | null }
  >()
  for (const doc of existing.docs) {
    const d = doc as {
      id: string | number
      toCollection: string
      toId: string
      anchorText?: string | null
      location?: string | null
    }
    stale.set(
      edgeKey({
        toCollection: d.toCollection,
        toId: d.toId,
        anchorText: d.anchorText ?? undefined,
        location: d.location ?? 'body',
      }),
      d,
    )
  }

  let inserted = 0
  let updated = 0
  let deleted = 0

  for (const e of edges) {
    const k = edgeKey(e)
    const prev = stale.get(k)
    if (prev) {
      await payload.update({
        collection: 'page-link-graph',
        id: prev.id,
        data: {
          lastSeenAt: now,
          toExternal: e.toExternal ?? null,
          anchorText: e.anchorText ?? null,
          createdBy,
        },
      })
      stale.delete(k)
      updated += 1
    } else {
      const loc = (e.location ?? 'body') as
        | 'body'
        | 'main_nav'
        | 'footer'
        | 'sidebar'
        | 'related_block'
        | 'breadcrumb'
        | 'author_bio'
      await payload.create({
        collection: 'page-link-graph',
        data: {
          site: ref,
          fromCollection,
          fromId,
          toCollection: e.toCollection,
          toId: e.toId,
          toExternal: e.toExternal ?? null,
          anchorText: e.anchorText ?? null,
          location: loc,
          createdBy,
          lastSeenAt: now,
        },
      })
      inserted += 1
    }
  }

  for (const row of stale.values()) {
    await payload.delete({ collection: 'page-link-graph', id: row.id })
    deleted += 1
  }

  return { inserted, updated, deleted, edgeCount: edges.length }
}
