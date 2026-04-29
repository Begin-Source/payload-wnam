import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  combineTenantWhere,
  getTenantScopeForStats,
  type TenantScope,
} from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

type DashboardStats = {
  sites: number
  sitesActive: number
  clickEvents: number
  clicksOnly: number
  articlesPublished: number
  pagesPublished: number
  workflowActive: number
  keywords: number
  commissions: number
  rankings: number
}

async function countScoped(
  payload: Awaited<ReturnType<typeof getPayload>>,
  scope: TenantScope,
  collection:
    | 'sites'
    | 'click-events'
    | 'articles'
    | 'pages'
    | 'workflow-jobs'
    | 'keywords'
    | 'commissions'
    | 'rankings',
  extraWhere?: Record<string, unknown>,
): Promise<number> {
  const where = combineTenantWhere(scope, extraWhere)
  const result = await payload.count({
    collection,
    where,
  })
  return result.totalDocs
}

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({
    config: configPromise,
  })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)

  const publishedWhere = { status: { equals: 'published' as const } }
  const workflowActiveWhere = {
    or: [
      { status: { equals: 'pending' as const } },
      { status: { equals: 'running' as const } },
    ],
  }
  const clickOnlyWhere = { eventType: { equals: 'click' as const } }
  const activeSiteWhere = { status: { equals: 'active' as const } }

  const [
    sites,
    sitesActive,
    clickEvents,
    clicksOnly,
    articlesPublished,
    pagesPublished,
    workflowActive,
    keywords,
    commissions,
    rankings,
  ] = await Promise.all([
    countScoped(payload, scope, 'sites'),
    countScoped(payload, scope, 'sites', activeSiteWhere),
    countScoped(payload, scope, 'click-events'),
    countScoped(payload, scope, 'click-events', clickOnlyWhere),
    countScoped(payload, scope, 'articles', publishedWhere),
    countScoped(payload, scope, 'pages', publishedWhere),
    countScoped(payload, scope, 'workflow-jobs', workflowActiveWhere),
    countScoped(payload, scope, 'keywords'),
    countScoped(payload, scope, 'commissions'),
    countScoped(payload, scope, 'rankings'),
  ])

  const body: DashboardStats = {
    sites,
    sitesActive,
    clickEvents,
    clicksOnly,
    articlesPublished,
    pagesPublished,
    workflowActive,
    keywords,
    commissions,
    rankings,
  }

  return Response.json(body)
}
