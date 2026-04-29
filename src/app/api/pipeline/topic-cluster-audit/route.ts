import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/topic-cluster-audit'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { siteId?: string }
  const payload = await getPayload({ config: configPromise })

  const sitePart: Where[] = []
  if (body.siteId && body.siteId !== '0') {
    const ref = /^\d+$/.test(body.siteId) ? Number(body.siteId) : body.siteId
    sitePart.push({ site: { equals: ref } })
  }

  const activeBase: Where[] = [{ status: { equals: 'active' } }, ...sitePart]

  const pillarHubs = await payload.count({
    collection: 'keywords',
    where: { and: [...activeBase, { pillar: { equals: null } }] },
  })

  const clusterKeywords = await payload.count({
    collection: 'keywords',
    where: { and: [...activeBase, { pillar: { not_equals: null } }] },
  })

  return Response.json({
    ok: true,
    siteId: body.siteId ?? null,
    counts: {
      /** Keywords with no `pillar` set — treated as pillar/hub rows in this MVP counter. */
      pillarHubKeywords: pillarHubs.totalDocs,
      clusterKeywords: clusterKeywords.totalDocs,
    },
    /** Later: pillar article outlinks + cluster uplink checks + triage job fanout. */
    violations: 'placeholder',
    workflowEnqueue: 'placeholder',
  })
}
