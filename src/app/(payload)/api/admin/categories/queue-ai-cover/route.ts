import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantScopeForStats, tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

/**
 * Legacy: enqueues `category_cover_generate` workflow jobs for pipeline tick.
 * Prefer `POST .../categories/generate-cover-sync` from Admin (updates `categoryCoverWorkflowStatus` inline).
 */

const MAX_TOTAL = 50

function parsePositiveIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x)
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n))
  }
  return [...new Set(out)]
}

function siteIdFromDoc(doc: { site?: number | { id: number } | null }): number | null {
  const s = doc.site
  if (s == null) return null
  return typeof s === 'object' ? s.id : s
}

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

async function pendingCategoryCoverJob(payload: PayloadInstance, categoryId: number): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'category_cover_generate' } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 150,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of r.docs) {
    const inp = doc.input as { categoryId?: unknown } | undefined
    const cid = inp?.categoryId
    const num =
      typeof cid === 'number' ? cid : typeof cid === 'string' && /^\d+$/.test(cid) ? Number(cid) : null
    if (num === categoryId) return true
  }
  return false
}

async function assertSiteAccess(
  payload: PayloadInstance,
  userArg: Config['user'] & { collection: 'users' },
  sid: number,
  scope: ReturnType<typeof getTenantScopeForStats>,
  isSu: boolean,
): Promise<boolean> {
  const siteDoc = await payload.findByID({
    collection: 'sites',
    id: String(sid),
    depth: 0,
    user: userArg,
    overrideAccess: false,
  })
  if (!siteDoc) return false
  const siteTenantId = tenantIdFromRelation((siteDoc as { tenant?: number | { id: number } | null }).tenant)
  return (
    isSu ||
    scope.mode === 'all' ||
    (siteTenantId != null && scope.mode === 'tenants' && scope.tenantIds.includes(siteTenantId))
  )
}

/** POST — enqueue Together category covers (workflow `category_cover_generate`). */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: unknown
    categoryIds?: unknown
  }

  const siteIdRaw = body.siteId
  const sid =
    typeof siteIdRaw === 'number' && Number.isFinite(siteIdRaw)
      ? Math.floor(siteIdRaw)
      : typeof siteIdRaw === 'string' && /^\d+$/.test(siteIdRaw.trim())
        ? Number(siteIdRaw.trim())
        : NaN
  if (!Number.isFinite(sid)) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
  }

  let categoryIds = parsePositiveIds(body.categoryIds)
  if (categoryIds.length === 0) {
    return Response.json({ error: 'categoryIds required (non-empty array)' }, { status: 400 })
  }
  if (categoryIds.length > MAX_TOTAL) categoryIds = categoryIds.slice(0, MAX_TOTAL)

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(userArg)
  const isSu = userHasUnscopedAdminAccess(userArg)

  if (!(await assertSiteAccess(payload, userArg, sid, scope, isSu))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const siteRow = await payload.findByID({
    collection: 'sites',
    id: String(sid),
    depth: 0,
    overrideAccess: true,
  })
  const siteTenantId = tenantIdFromRelation((siteRow as { tenant?: number | { id: number } | null } | null)?.tenant)

  const queued: number[] = []
  const skipped: { kind: string; id: number; reason: string }[] = []

  for (const categoryId of categoryIds) {
    try {
      const cat = await payload.findByID({
        collection: 'categories',
        id: String(categoryId),
        depth: 0,
        user: userArg,
        overrideAccess: false,
      })
      if (!cat) {
        skipped.push({ kind: 'category', id: categoryId, reason: 'not_found_or_forbidden' })
        continue
      }
      const catSite = siteIdFromDoc(cat as { site?: number | { id: number } | null })
      if (catSite == null || catSite !== sid) {
        skipped.push({
          kind: 'category',
          id: categoryId,
          reason: 'site_mismatch',
        })
        continue
      }

      if (await pendingCategoryCoverJob(payload, categoryId)) {
        skipped.push({ kind: 'category', id: categoryId, reason: 'already_pending_or_running' })
        continue
      }

      await payload.create({
        collection: 'workflow-jobs',
        data: {
          label: `Together 分类封面 · category #${categoryId}`.slice(0, 120),
          jobType: 'category_cover_generate',
          status: 'pending',
          site: sid,
          ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
          input: {
            categoryId,
            siteId: sid,
          },
        },
        overrideAccess: true,
      })

      queued.push(categoryId)
    } catch {
      skipped.push({ kind: 'category', id: categoryId, reason: 'error' })
    }
  }

  return Response.json({
    ok: true,
    queuedCategoryIds: queued,
    queuedCount: queued.length,
    skipped,
  })
}
