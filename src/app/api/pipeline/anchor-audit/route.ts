import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { auditAnchorsForSite } from '@/utilities/anchorTextAudit'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/anchor-audit'

function siteEquals(siteId: string): string | number {
  return /^\d+$/.test(siteId) ? Number(siteId) : siteId
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { siteId?: string }
  const payload = await getPayload({ config: configPromise })

  const where: Where[] = [{ location: { equals: 'body' } }]
  if (body.siteId && body.siteId !== '0') {
    where.push({ site: { equals: siteEquals(body.siteId) } })
  }

  const res = await payload.find({
    collection: 'page-link-graph',
    where: { and: where },
    limit: 5000,
    depth: 0,
  })

  const edges = res.docs.map((d) => {
    const row = d as { toId: string; anchorText?: string | null; anchorType?: string | null }
    return {
      toId: String(row.toId),
      anchorText: row.anchorText,
      anchorType: row.anchorType,
    }
  })

  const reports = auditAnchorsForSite(body.siteId ?? 'all', edges)
  const flagged = reports.filter((r) => r.overOptimized || r.genericAnchorOveruse).slice(0, 40)

  return Response.json({
    ok: true,
    siteId: body.siteId ?? null,
    edgeSampleSize: edges.length,
    reportsTop: reports.slice(0, 30),
    flagged,
    knowledgeBaseWrite: 'placeholder',
  })
}
