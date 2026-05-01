import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runKeywordClusterForSite } from '@/utilities/keywordClusterPipeline'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/keyword-cluster'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: number
    keywordIds?: unknown
    minOverlap?: number
    refresh?: boolean
  }

  const siteId = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const rawIds = body.keywordIds
  const keywordIds: number[] = []
  if (Array.isArray(rawIds)) {
    for (const x of rawIds) {
      const n = typeof x === 'number' ? x : Number(x)
      if (Number.isFinite(n)) keywordIds.push(Math.floor(n))
    }
  }

  if (keywordIds.length === 0) {
    return Response.json({ error: 'keywordIds is required (non-empty array)' }, { status: 400 })
  }

  const mo = typeof body.minOverlap === 'number' ? body.minOverlap : Number(body.minOverlap)
  const minOverlap = Number.isFinite(mo) ? Math.min(6, Math.max(2, Math.floor(mo))) : 3

  const payload = await getPayload({ config: configPromise })
  const out = await runKeywordClusterForSite({
    payload,
    siteId,
    keywordIds,
    minOverlap,
    refresh: body.refresh === true,
  })

  if (!out.ok) {
    return Response.json({ ok: false, error: out.error }, { status: 400 })
  }

  return Response.json({ ok: true, ...out })
}
