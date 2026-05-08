import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { classifyGeoFriendly } from '@/utilities/classifyGeoFriendly'
import { isUsersCollection } from '@/utilities/announcementAccess'
import type { KeywordIntent } from '@/utilities/keywordEligibility'
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

const PAGE = 50

/**
 * POST { siteId?: number } — recompute keywords.geoFriendly from term + intent (idempotent).
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  } catch {
    body = {}
  }

  const siteIdRaw = body.siteId
  const siteIdFilter =
    typeof siteIdRaw === 'number'
      ? siteIdRaw
      : typeof siteIdRaw === 'string' && /^\d+$/.test(siteIdRaw.trim())
        ? Number(siteIdRaw.trim())
        : null

  const scope = getTenantScopeForStats(user)

  if (siteIdFilter != null && Number.isFinite(siteIdFilter)) {
    const site = await payload.findByID({
      collection: 'sites',
      id: siteIdFilter,
      depth: 0,
    })
    if (!site) {
      return Response.json({ error: 'Site not found' }, { status: 404 })
    }
    const siteTenantId = tenantIdFromRelation(
      (site as { tenant?: number | { id: number } | null }).tenant,
    )
    if (!siteAccessible(scope, siteTenantId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let updated = 0
  let scanned = 0
  let page = 1

  for (;;) {
    const res = await payload.find({
      collection: 'keywords',
      where:
        siteIdFilter != null && Number.isFinite(siteIdFilter)
          ? { site: { equals: siteIdFilter } }
          : {},
      limit: PAGE,
      page,
      depth: 0,
      user,
      overrideAccess: false,
    })

    const docs = res.docs as unknown as Array<{
      id: number
      term: string
      intent?: KeywordIntent | null
      geoFriendly?: boolean | null
    }>

    if (docs.length === 0) break

    for (const doc of docs) {
      scanned += 1
      const next = classifyGeoFriendly(doc.term, doc.intent ?? null)
      if (doc.geoFriendly === next) continue
      try {
        await payload.update({
          collection: 'keywords',
          id: doc.id,
          data: { geoFriendly: next },
          user,
          overrideAccess: false,
        })
        updated += 1
      } catch {
        /* access or validation */
      }
    }

    if (docs.length < PAGE) break
    page += 1
    if (page > 400) break
  }

  return Response.json({ ok: true, scanned, updated, siteId: siteIdFilter })
}
