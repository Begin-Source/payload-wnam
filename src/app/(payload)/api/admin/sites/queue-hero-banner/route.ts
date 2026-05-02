import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantScopeForStats, tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const MAX_TOTAL = 30

function parsePositiveIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x)
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n))
  }
  return [...new Set(out)]
}

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

function isAmzShell(layout: string | null | undefined): boolean {
  return layout === 'amz-template-1' || layout === 'amz-template-2'
}

async function pendingHeroBannerJob(payload: PayloadInstance, siteIdNum: number): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'hero_banner_generate' } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 150,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of r.docs) {
    const inp = doc.input as { siteId?: unknown } | undefined
    const sid = inp?.siteId
    const num =
      typeof sid === 'number'
        ? sid
        : typeof sid === 'string' && /^\d+$/.test(sid.trim())
          ? Number(sid.trim())
          : null
    if (num === siteIdNum) return true
    const rel = doc.site
    const rid =
      typeof rel === 'number'
        ? rel
        : rel && typeof rel === 'object' && 'id' in rel
          ? Number((rel as { id: unknown }).id)
          : NaN
    if (Number.isFinite(rid) && rid === siteIdNum) return true
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

/** POST — enqueue Together homepage hero banners (workflow `hero_banner_generate`). */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteIds?: unknown
    prompt?: unknown
  }

  let siteIds = parsePositiveIds(body.siteIds)
  if (siteIds.length === 0) {
    return Response.json({ error: 'siteIds required (non-empty array)' }, { status: 400 })
  }
  if (siteIds.length > MAX_TOTAL) siteIds = siteIds.slice(0, MAX_TOTAL)

  const promptOverride =
    typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(userArg)
  const isSu = userHasUnscopedAdminAccess(userArg)

  const queued: number[] = []
  const skipped: { id: number; reason: string }[] = []

  for (const sid of siteIds) {
    try {
      if (!(await assertSiteAccess(payload, userArg, sid, scope, isSu))) {
        skipped.push({ id: sid, reason: 'forbidden_or_not_found' })
        continue
      }

      const row = await payload.findByID({
        collection: 'sites',
        id: String(sid),
        depth: 0,
        overrideAccess: true,
      })
      if (!row) {
        skipped.push({ id: sid, reason: 'not_found' })
        continue
      }
      const layout = (row as { siteLayout?: string | null }).siteLayout
      if (!isAmzShell(layout ?? null)) {
        skipped.push({ id: sid, reason: 'layout_not_amz' })
        continue
      }

      if (await pendingHeroBannerJob(payload, sid)) {
        skipped.push({ id: sid, reason: 'already_pending_or_running' })
        continue
      }

      const siteTenantId = tenantIdFromRelation((row as { tenant?: number | { id: number } | null }).tenant)

      await payload.create({
        collection: 'workflow-jobs',
        data: {
          label: `Together 首页横幅 · site #${sid}`.slice(0, 120),
          jobType: 'hero_banner_generate',
          status: 'pending',
          site: sid,
          ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
          input: {
            siteId: sid,
            ...(promptOverride ? { prompt: promptOverride.slice(0, 4000) } : {}),
          },
        },
        overrideAccess: true,
      })

      queued.push(sid)
    } catch {
      skipped.push({ id: sid, reason: 'error' })
    }
  }

  return Response.json({
    ok: true,
    queuedSiteIds: queued,
    queuedCount: queued.length,
    skipped,
  })
}
