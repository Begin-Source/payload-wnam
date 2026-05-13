import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { dailyPostCapForSite } from '@/utilities/articlePublishScheduling'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(tenant: number | { id: number } | null | undefined): number | null {
  if (tenant == null) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function relationId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  if (raw && typeof raw === 'object' && 'id' in raw) return relationId((raw as { id?: unknown }).id)
  return null
}

function siteAccessible(scope: TenantScope, siteTenantId: number | null): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

async function count(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: 'articles' | 'content-briefs' | 'keywords' | 'workflow-jobs',
  where: Record<string, unknown>,
): Promise<number> {
  const r = await payload.count({ collection, where, overrideAccess: true })
  return r.totalDocs
}

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const siteIdRaw = url.searchParams.get('siteId')
  const siteId = siteIdRaw != null ? Number(siteIdRaw) : NaN
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const site = await payload.findByID({ collection: 'sites', id: siteId, depth: 1 })
  if (!site) return Response.json({ error: 'Site not found' }, { status: 404 })

  const siteTenantId = tenantIdFromRelation(
    (site as { tenant?: number | { id: number } | null }).tenant,
  )
  if (!siteAccessible(getTenantScopeForStats(user), siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const siteWhere = { site: { equals: siteId } }
  const pendingJobs = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [siteWhere, { status: { equals: 'pending' } }],
    },
    limit: 100,
    depth: 0,
    sort: 'createdAt',
    overrideAccess: true,
  })

  const pendingJobIds = pendingJobs.docs
    .map((job) => relationId((job as { id?: unknown }).id))
    .filter((id): id is number => id != null)

  const pipeline = (site as { pipelineProfile?: unknown }).pipelineProfile
  const preset = (site as { keywordBatchPreset?: unknown }).keywordBatchPreset

  const [
    keywordsTotal,
    keywordsEligible,
    briefsTotal,
    articlesDraft,
    articlesPublished,
    articlesQueued,
    articlesBlocked,
    jobsRunning,
    jobsFailed,
    dailyPostCap,
  ] = await Promise.all([
    count(payload, 'keywords', siteWhere),
    count(payload, 'keywords', { and: [siteWhere, { eligible: { equals: true } }] }),
    count(payload, 'content-briefs', siteWhere),
    count(payload, 'articles', { and: [siteWhere, { status: { equals: 'draft' } }] }),
    count(payload, 'articles', { and: [siteWhere, { status: { equals: 'published' } }] }),
    count(payload, 'articles', { and: [siteWhere, { publishQueueStatus: { equals: 'queued' } }] }),
    count(payload, 'articles', { and: [siteWhere, { publishQueueStatus: { equals: 'blocked' } }] }),
    count(payload, 'workflow-jobs', { and: [siteWhere, { status: { equals: 'running' } }] }),
    count(payload, 'workflow-jobs', { and: [siteWhere, { status: { equals: 'failed' } }] }),
    dailyPostCapForSite(payload, siteId),
  ])

  return Response.json({
    ok: true,
    site: {
      id: site.id,
      name: site.name,
      slug: site.slug,
      primaryDomain: site.primaryDomain,
      mainProduct: (site as { mainProduct?: string | null }).mainProduct ?? null,
      siteLayout: (site as { siteLayout?: string | null }).siteLayout ?? null,
      status: (site as { status?: string | null }).status ?? null,
      defaultAmazonTrackingId:
        (site as { defaultAmazonTrackingId?: string | null }).defaultAmazonTrackingId ?? null,
      notes: (site as { notes?: string | null }).notes ?? null,
      pipelineProfile:
        pipeline && typeof pipeline === 'object'
          ? {
              id: (pipeline as { id?: unknown }).id,
              name: (pipeline as { name?: unknown }).name,
              slug: (pipeline as { slug?: unknown }).slug,
            }
          : null,
      keywordBatchPreset:
        preset && typeof preset === 'object'
          ? {
              id: (preset as { id?: unknown }).id,
              name: (preset as { name?: unknown }).name,
              slug: (preset as { slug?: unknown }).slug,
              batchMode: (preset as { batchMode?: unknown }).batchMode,
              defaultBatchLimit: (preset as { defaultBatchLimit?: unknown }).defaultBatchLimit,
            }
          : null,
    },
    counts: {
      keywordsTotal,
      keywordsEligible,
      briefsTotal,
      articlesDraft,
      articlesPublished,
      articlesQueued,
      articlesBlocked,
      jobsPending: pendingJobs.totalDocs,
      jobsRunning,
      jobsFailed,
      dailyPostCap,
    },
    pendingJobIds,
  })
}
