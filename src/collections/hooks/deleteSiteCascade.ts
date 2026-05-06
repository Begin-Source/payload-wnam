import type { Payload, PayloadRequest } from 'payload'

import type { Config } from '@/payload-types'

type CollectionSlug = keyof Config['collections']

const WAVE_1: CollectionSlug[] = [
  'workflow-jobs',
  'page-link-graph',
  'click-events',
  'commissions',
  'rankings',
  'serp-snapshots',
  'redirects',
]

const WAVE_4: CollectionSlug[] = [
  'keywords',
  'content-briefs',
  'knowledge-base',
  'social-accounts',
  'categories',
  'site-blueprints',
  'site-quotas',
]

/** Payload `beforeDelete` runs before the document row is loaded; only `id` is reliable. */
export async function deleteSiteCascadeBeforeDelete(args: {
  id: number | string
  req: PayloadRequest
}): Promise<void> {
  const { id, req } = args
  const siteId = typeof id === 'number' ? id : Number.parseInt(String(id), 10)
  if (!Number.isFinite(siteId) || siteId <= 0) {
    req.payload.logger.warn(`deleteSiteCascade: skip invalid site id ${String(id)}`)
    return
  }

  try {
    await purgeSiteScopedCollections(req.payload, req, siteId)
  } catch (err) {
    req.payload.logger.error({ err, siteId }, 'deleteSiteCascade failed')
    throw err instanceof Error ? err : new Error(`deleteSiteCascade failed for site ${siteId}`)
  }
}

async function deleteDocsWhereSite(
  payload: Payload,
  req: PayloadRequest,
  collection: CollectionSlug,
  siteId: number,
): Promise<void> {
  const where = { site: { equals: siteId } }
  let guard = 0
  while (guard++ < 10_000) {
    const res = await payload.find({
      collection,
      where,
      depth: 0,
      limit: 100,
      pagination: false,
      req,
      overrideAccess: true,
    })
    if (res.docs.length === 0) break
    for (const doc of res.docs) {
      await payload.delete({
        collection,
        id: doc.id,
        req,
        overrideAccess: true,
      })
    }
  }
}

function chunkIds(ids: number[], size: number): number[][] {
  const out: number[][] = []
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size))
  }
  return out
}

async function collectArticleIds(
  payload: Payload,
  req: PayloadRequest,
  siteId: number,
): Promise<number[]> {
  const ids: number[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'articles',
      where: { site: { equals: siteId } },
      depth: 0,
      limit: 200,
      page,
      pagination: true,
      req,
      overrideAccess: true,
    })
    ids.push(...res.docs.map((d: { id: number }) => d.id))
    if (!res.hasNextPage) break
    page++
  }
  return ids
}

async function deleteOriginalEvidenceForArticles(
  payload: Payload,
  req: PayloadRequest,
  articleIds: number[],
): Promise<void> {
  if (articleIds.length === 0) return

  for (const idsChunk of chunkIds(articleIds, 40)) {
    let guard = 0
    while (guard++ < 10_000) {
      const res = await payload.find({
        collection: 'original-evidence',
        where: { article: { in: idsChunk } },
        depth: 0,
        limit: 100,
        pagination: false,
        req,
        overrideAccess: true,
      })
      if (res.docs.length === 0) break
      for (const doc of res.docs) {
        await payload.delete({
          collection: 'original-evidence',
          id: doc.id,
          req,
          overrideAccess: true,
        })
      }
    }
  }
}

async function purgeSiteScopedCollections(
  payload: Payload,
  req: PayloadRequest,
  siteId: number,
): Promise<void> {
  for (const slug of WAVE_1) {
    await deleteDocsWhereSite(payload, req, slug, siteId)
  }

  const articleIds = await collectArticleIds(payload, req, siteId)
  await deleteOriginalEvidenceForArticles(payload, req, articleIds)

  await deleteDocsWhereSite(payload, req, 'articles', siteId)
  await deleteDocsWhereSite(payload, req, 'pages', siteId)

  for (const slug of WAVE_4) {
    await deleteDocsWhereSite(payload, req, slug, siteId)
  }

  await payload.update({
    collection: 'sites',
    id: siteId,
    data: {
      homepageHeroBanner: null,
      siteLogo: null,
    },
    req,
    overrideAccess: true,
  })

  await deleteDocsWhereSite(payload, req, 'media', siteId)
}
