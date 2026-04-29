import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)
  const published = { status: { equals: 'published' as const } }

  const stages = [
    'n_a',
    'probation',
    'winner',
    'borderline',
    'loser',
    'stable_watch',
    'repaired',
    'dying',
    'merged',
    'archived',
  ] as const

  const lifecycle: Record<string, number> = {}
  for (const s of stages) {
    const where = combineTenantWhere(scope, {
      and: [published, { lifecycleStage: { equals: s } }],
    })
    const c = await payload.count({ collection: 'articles', where: where ?? {} })
    lifecycle[s] = c.totalDocs
  }

  let siteIds: (string | number)[] = []
  if (scope.mode === 'tenants') {
    const tw = combineTenantWhere(scope, {})
    const sites = await payload.find({
      collection: 'sites',
      ...(tw ? { where: tw } : {}),
      limit: 500,
      depth: 0,
    })
    siteIds = sites.docs.map((d) => (d as { id: string | number }).id)
  }

  const kwWhere =
    scope.mode === 'tenants' && siteIds.length === 0
      ? { id: { equals: 0 } }
      : scope.mode === 'tenants' && siteIds.length
        ? {
            and: [{ status: { equals: 'active' as const } }, { site: { in: siteIds } }],
          }
        : { status: { equals: 'active' as const } }

  const keywords = await payload.find({
    collection: 'keywords',
    where: kwWhere,
    sort: '-opportunityScore',
    limit: 42,
    depth: 0,
  })

  const graphCountRes =
    scope.mode === 'tenants' && siteIds.length
      ? await payload.count({
          collection: 'page-link-graph',
          where: { site: { in: siteIds } },
        })
      : scope.mode === 'tenants' && siteIds.length === 0
        ? { totalDocs: 0 }
        : await payload.count({ collection: 'page-link-graph', where: {} })
  const graphCount = graphCountRes.totalDocs

  const quotas = await payload.find({
    collection: 'site-quotas',
    where:
      scope.mode === 'tenants' && siteIds.length
        ? { site: { in: siteIds } }
        : scope.mode === 'tenants'
          ? { id: { equals: 0 } }
          : {},
    limit: 50,
    depth: 0,
  })
  const dailyPostCapSample = quotas.docs.map((d) => ({
    siteId: (d as { site: unknown }).site,
    dailyPostCap: (d as { dailyPostCap?: number | null }).dailyPostCap ?? 3,
  }))

  return Response.json({
    lifecycle,
    linkGraph: { totalEdges: graphCount },
    roi: {
      note: 'Wire billing + GSC for spend vs clicks; placeholders only.',
      spendUsdPlaceholder: 0,
      clicks30dPlaceholder: 0,
    },
    calendar: {
      dailyPostCapSample,
      rows: keywords.docs.map((d) => {
        const k = d as {
          id: string | number
          term?: string | null
          opportunityScore?: number | null
          site?: unknown
        }
        return {
          id: k.id,
          term: k.term,
          opportunityScore: k.opportunityScore ?? null,
          site: typeof k.site === 'object' && k.site && 'id' in k.site ? (k.site as { id: unknown }).id : k.site,
        }
      }),
    },
  })
}
