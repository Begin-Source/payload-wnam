/**
 * 全量回填 page-link-graph：遍历 articles + pages 的 body，调用 syncBodyLinksToGraph。
 * Usage: pnpm run seed:linkgraph
 */
import 'dotenv/config'

import { getPayload } from 'payload'
import config from '../src/payload.config.js'
import { syncBodyLinksToGraph } from '../src/services/linkgraph/ingest'

async function main(): Promise<void> {
  const payload = await getPayload({ config })
  let articles = 0
  let pages = 0

  for (let page = 1; page <= 200; page += 1) {
    const res = await payload.find({
      collection: 'articles',
      limit: 50,
      page,
      depth: 0,
      overrideAccess: true,
    })
    if (!res.docs.length) break
    for (const doc of res.docs) {
      const d = doc as { id: number; site?: number | { id: number } | null; body?: unknown }
      const siteRaw = d.site
      const siteId =
        typeof siteRaw === 'object' && siteRaw?.id != null
          ? String(siteRaw.id)
          : typeof siteRaw === 'number'
            ? String(siteRaw)
            : null
      if (!siteId || d.body == null) continue
      await syncBodyLinksToGraph(payload, {
        siteId,
        fromCollection: 'articles',
        fromId: String(d.id),
        body: d.body,
        createdBy: 'seed:linkgraph',
      })
      articles += 1
    }
    if (res.hasNextPage !== true) break
  }

  for (let page = 1; page <= 200; page += 1) {
    const res = await payload.find({
      collection: 'pages',
      limit: 50,
      page,
      depth: 0,
      overrideAccess: true,
    })
    if (!res.docs.length) break
    for (const doc of res.docs) {
      const d = doc as { id: number; site?: number | { id: number } | null; body?: unknown }
      const siteRaw = d.site
      const siteId =
        typeof siteRaw === 'object' && siteRaw?.id != null
          ? String(siteRaw.id)
          : typeof siteRaw === 'number'
            ? String(siteRaw)
            : null
      if (!siteId || d.body == null) continue
      await syncBodyLinksToGraph(payload, {
        siteId,
        fromCollection: 'pages',
        fromId: String(d.id),
        body: d.body,
        createdBy: 'seed:linkgraph',
      })
      pages += 1
    }
    if (res.hasNextPage !== true) break
  }

  console.info('[seed:linkgraph] Synced articles=', articles, 'pages=', pages)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
