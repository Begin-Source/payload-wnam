import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { assertUsersCollection } from '@/utilities/workflowQuickCreate'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(scope: TenantScope, siteTenantId: number | null): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

/**
 * POST { keywordId: number } — enqueue a single `brief_generate` job from Content Calendar row (钉子 4).
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { keywordId?: unknown }
  try {
    body = (await request.json()) as { keywordId?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const kid = typeof body.keywordId === 'number' ? body.keywordId : Number(body.keywordId)
  if (!Number.isFinite(kid)) {
    return Response.json({ error: 'keywordId is required' }, { status: 400 })
  }

  const kw = await payload.findByID({ collection: 'keywords', id: String(kid), depth: 1 })
  if (!kw) {
    return Response.json({ error: 'Keyword not found' }, { status: 404 })
  }

  const siteField = (kw as { site?: number | { id: number } | null }).site
  const siteId =
    typeof siteField === 'object' && siteField?.id != null
      ? siteField.id
      : typeof siteField === 'number'
        ? siteField
        : null
  if (siteId == null || !Number.isFinite(siteId)) {
    return Response.json({ error: 'Keyword has no site' }, { status: 400 })
  }

  const site = await payload.findByID({ collection: 'sites', id: String(siteId), depth: 0 })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }

  const scope = getTenantScopeForStats(user)
  const siteTenantId = tenantIdFromRelation((site as { tenant?: number | { id: number } | null }).tenant)
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const pending = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'brief_generate' } },
        { status: { in: ['pending', 'running'] } },
        { pipelineKeyword: { equals: kid } },
      ],
    },
  })
  if (pending.totalDocs > 0) {
    return Response.json({ error: 'This keyword already has a pending or running brief_generate job' }, { status: 409 })
  }

  const term = (kw as { term?: string }).term || 'keyword'
  const label = `Content calendar: ${term}`.slice(0, 120)

  const job = await payload.create({
    collection: 'workflow-jobs',
    data: {
      label,
      jobType: 'brief_generate',
      status: 'pending',
      site: siteId,
      pipelineKeyword: kid,
      input: { keywordId: kid, siteId, fromContentCalendar: true },
      ...(siteTenantId != null && Number.isFinite(siteTenantId) ? { tenant: siteTenantId } : {}),
    },
  })

  return Response.json({ ok: true, id: (job as { id: number }).id })
}
