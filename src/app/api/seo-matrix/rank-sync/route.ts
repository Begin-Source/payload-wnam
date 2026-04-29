import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { forwardPipelinePost, readJsonSafe } from '@/app/api/pipeline/lib/internalPipelineFetch'

export const dynamic = 'force-dynamic'

const PATH = '/api/seo-matrix/rank-sync'

/**
 * Cron-friendly batch: active sites × keywords → POST /api/pipeline/rank-track per keyword.
 * Auth: `x-internal-token: PAYLOAD_SECRET` (same as other pipeline routes).
 */
export async function GET(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  return Response.json({
    ok: true,
    path: PATH,
    hint: 'POST JSON body: { maxSites?: number (default 20), keywordsPerSite?: number (default 5) }',
    pipeline: 'Each call forwards to /api/pipeline/rank-track with keywordId (DataForSEO).',
  })
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    maxSites?: number
    keywordsPerSite?: number
  }
  const maxSites = Math.min(100, Math.max(1, Number(body.maxSites) || 20))
  const keywordsPerSite = Math.min(50, Math.max(1, Number(body.keywordsPerSite) || 5))

  const payload = await getPayload({ config: configPromise })
  const sites = await payload.find({
    collection: 'sites',
    where: { status: { equals: 'active' } },
    limit: maxSites,
    depth: 0,
    overrideAccess: true,
  })

  const results: Array<{
    siteId: number | string
    keywordId: number | string
    status: number
    body: unknown
  }> = []

  for (const site of sites.docs) {
    const siteId = site.id
    const kw = await payload.find({
      collection: 'keywords',
      where: { site: { equals: siteId } },
      limit: keywordsPerSite,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of kw.docs) {
      const res = await forwardPipelinePost(request, '/api/pipeline/rank-track', {
        keywordId: doc.id,
      })
      results.push({
        siteId,
        keywordId: doc.id,
        status: res.status,
        body: await readJsonSafe(res),
      })
    }
  }

  return Response.json({
    ok: true,
    sitesScanned: sites.docs.length,
    rankTrackCalls: results.length,
    results,
  })
}
