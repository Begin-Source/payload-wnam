import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
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

function presetIdFromRelation(
  rel: number | { id: number } | null | undefined,
): number | null {
  if (rel == null || rel === undefined) return null
  if (typeof rel === 'number') return rel
  if (typeof rel === 'object' && typeof rel.id === 'number') return rel.id
  return null
}

/**
 * GET ?siteId= — keyword batch preset linked on the site (for admin drawer prefill).
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)
  const url = new URL(request.url)
  const siteIdRaw = url.searchParams.get('siteId')
  const siteId = siteIdRaw != null && siteIdRaw !== '' ? Number(siteIdRaw) : NaN
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId required (number)' }, { status: 400 })
  }

  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 1,
  })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }

  const siteTenantId = tenantIdFromRelation(site.tenant)
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = (site as { keywordBatchPreset?: unknown }).keywordBatchPreset
  const pid = presetIdFromRelation(
    raw as number | { id: number } | null | undefined,
  )
  if (pid == null) {
    return Response.json({ preset: null })
  }

  let presetDoc: Record<string, unknown> | null = null
  if (typeof raw === 'object' && raw !== null && 'batchMode' in raw) {
    presetDoc = raw as Record<string, unknown>
  } else {
    presetDoc = (await payload.findByID({
      collection: 'keyword-batch-presets',
      id: pid,
      depth: 0,
    })) as Record<string, unknown> | null
  }

  if (!presetDoc || typeof presetDoc !== 'object') {
    return Response.json({ preset: null })
  }

  const presetTenantId = tenantIdFromRelation(
    presetDoc.tenant as number | { id: number } | null | undefined,
  )
  if (
    siteTenantId != null &&
    presetTenantId != null &&
    siteTenantId !== presetTenantId
  ) {
    return Response.json({ preset: null })
  }

  return Response.json({
    preset: {
      id: presetDoc.id,
      name: presetDoc.name,
      slug: presetDoc.slug,
      batchMode: presetDoc.batchMode,
      defaultBatchLimit: presetDoc.defaultBatchLimit,
      eligibleOnly: presetDoc.eligibleOnly,
      intentWhitelist: presetDoc.intentWhitelist,
      minVolume: presetDoc.minVolume,
      maxVolume: presetDoc.maxVolume,
      maxKd: presetDoc.maxKd,
      maxPick: presetDoc.maxPick,
      clusterBeforeEnqueue: presetDoc.clusterBeforeEnqueue,
      clusterMinOverlap: presetDoc.clusterMinOverlap,
    },
  })
}
