import type { Payload } from 'payload'

const TTL_MS = 7 * 24 * 60 * 60 * 1000

export type PersistSerpSnapshotArgs = {
  payload: Payload
  keywordId: number
  siteId: number
  tenantId: number
  searchQuery: string
  /** Stored as text; use stable string e.g. `${location_code}` */
  locationLabel: string
  deviceLabel: 'mobile' | 'desktop'
  raw: unknown
}

/** Most recent DFS raw for this fingerprint within TTL (for skipping repeat SERP spends). */
export async function findRecentSerpSnapshotRaw(args: {
  payload: Payload
  keywordId: number
  locationLabel: string
  deviceLabel: 'mobile' | 'desktop'
}): Promise<unknown | null> {
  const { payload, keywordId, locationLabel, deviceLabel } = args
  const cutoff = new Date(Date.now() - TTL_MS).toISOString()
  const existing = await payload.find({
    collection: 'serp-snapshots',
    where: {
      and: [
        { keyword: { equals: keywordId } },
        { engine: { equals: 'google' } },
        { device: { equals: deviceLabel } },
        { location: { equals: locationLabel } },
        { capturedAt: { greater_than: cutoff } },
      ],
    },
    limit: 1,
    sort: '-capturedAt',
    depth: 0,
    overrideAccess: true,
  })
  const doc = existing.docs[0] as { raw?: unknown } | undefined
  return doc?.raw != null ? doc.raw : null
}

/**
 * Always insert a new row after a paid SERP fetch (latest wins on subsequent `find`).
 * TODO: optionally zstd+base64-compress `raw` for very large payloads.
 */
export async function appendSerpSnapshot(args: PersistSerpSnapshotArgs): Promise<void> {
  const { payload, keywordId, siteId, tenantId, searchQuery, locationLabel, deviceLabel, raw } = args

  await payload.create({
    collection: 'serp-snapshots',
    data: {
      searchQuery,
      keyword: keywordId,
      site: siteId,
      tenant: tenantId,
      engine: 'google',
      device: deviceLabel,
      location: locationLabel,
      capturedAt: new Date().toISOString(),
      raw: JSON.parse(JSON.stringify(raw)) as Record<string, unknown>,
    },
    overrideAccess: true,
  })
}
