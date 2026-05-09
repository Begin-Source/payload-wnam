/**
 * Prune invalid `articles.relatedOffers` ids (Featured products AMZ).
 *
 * Default: dry-run (log only). Pass --execute to persist.
 *
 * Usage:
 *   pnpm prune:related-offers
 *   pnpm prune:related-offers -- --execute
 */
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

import { getPayload } from 'payload'

import config from '../src/payload.config.js'
import type { MinimalOfferForPrune } from '../src/utilities/pruneArticleRelatedOffers.js'
import {
  normalizeRelatedOfferIdList,
  pruneArticleRelatedOffersFromInputs,
} from '../src/utilities/pruneArticleRelatedOffers.js'

const PAGE_SIZE = 100

function parseArgs(argv: string[]): { execute: boolean } {
  return { execute: argv.includes('--execute') }
}

function siteIdsFromRelationField(raw: unknown): number[] {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : []
  const out: number[] = []
  for (const s of arr) {
    const id =
      typeof s === 'number'
        ? s
        : s && typeof s === 'object' && 'id' in s
          ? Number((s as { id: unknown }).id)
          : NaN
    if (Number.isFinite(id)) out.push(id)
  }
  return out
}

function offersMapFromDocs(docs: unknown[]): Map<number, MinimalOfferForPrune> {
  const m = new Map<number, MinimalOfferForPrune>()
  for (const d of docs) {
    if (!d || typeof d !== 'object' || !('id' in d)) continue
    const id = Number((d as { id: unknown }).id)
    if (!Number.isFinite(id)) continue
    const status = String((d as { status?: unknown }).status ?? '')
    const sites = (d as { sites?: unknown }).sites
    m.set(id, { id, status, siteIds: siteIdsFromRelationField(sites) })
  }
  return m
}

async function main(): Promise<void> {
  const { execute } = parseArgs(process.argv.slice(2))
  const payload = await getPayload({ config })

  let page = 1
  let scanned = 0
  let withOffers = 0
  let wouldUpdate = 0
  let updated = 0

  for (;;) {
    const res = await payload.find({
      collection: 'articles',
      limit: PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
      select: {
        site: true,
        relatedOffers: true,
      },
    })

    const docs = res.docs as Array<{
      id: number
      site?: unknown
      relatedOffers?: unknown
    }>

    if (docs.length === 0) break

    const articlesNeeding = docs.filter((d) => normalizeRelatedOfferIdList(d.relatedOffers).length > 0)
    scanned += docs.length
    withOffers += articlesNeeding.length

    const offerIdSet = new Set<number>()
    for (const a of articlesNeeding) {
      for (const oid of normalizeRelatedOfferIdList(a.relatedOffers)) {
        offerIdSet.add(oid)
      }
    }

    let offersById = new Map<number, MinimalOfferForPrune>()
    if (offerIdSet.size > 0) {
      const offerList = Array.from(offerIdSet)
      const offersRes = await payload.find({
        collection: 'offers',
        where: { id: { in: offerList } },
        limit: offerList.length,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        select: { status: true, sites: true },
      })
      offersById = offersMapFromDocs(offersRes.docs as unknown[])
    }

    for (const a of articlesNeeding) {
      const before = normalizeRelatedOfferIdList(a.relatedOffers)
      const r = pruneArticleRelatedOffersFromInputs({
        site: a.site,
        relatedOffersRaw: a.relatedOffers,
        offersById,
      })
      if (!r.changed) continue
      wouldUpdate += 1
      const line = {
        articleId: a.id,
        before,
        after: r.pruned,
        dropped: r.dropped,
        mode: execute ? 'update' : 'dry-run',
      }
      console.info(JSON.stringify(line))
      if (execute) {
        await payload.update({
          collection: 'articles',
          id: String(a.id),
          data: { relatedOffers: r.pruned },
          overrideAccess: true,
        })
        updated += 1
      }
    }

    if (docs.length < PAGE_SIZE) break
    page += 1
  }

  console.info(
    JSON.stringify({
      ok: true,
      execute,
      scannedArticles: scanned,
      articlesWithRelatedOffers: withOffers,
      wouldUpdate,
      updated: execute ? updated : 0,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
