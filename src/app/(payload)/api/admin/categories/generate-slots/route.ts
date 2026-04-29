import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  prepareCategorySlotsForSite,
  runCategorySlotsForSite,
} from '@/utilities/categorySlotsGeneration/runCategorySlotsForSite'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

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

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'on'
}

/**
 * POST { siteId, prepare?, afterPrepare?, mainProduct?, force?, aiModel? }
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    siteId?: unknown
    prepare?: unknown
    afterPrepare?: unknown
    mainProduct?: unknown
    force?: unknown
    aiModel?: unknown
    ai_model?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const scope = getTenantScopeForStats(user)
  const site = await payload.findByID({ collection: 'sites', id: siteId, depth: 0 })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }
  const siteTenantId = tenantIdFromRelation(
    (site as { tenant?: number | { id: number } | null }).tenant,
  )
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawMain = body.mainProduct
  const mainProductOverride =
    typeof rawMain === 'string' && rawMain.trim() ? rawMain.trim() : undefined

  const rawModel = body.aiModel ?? body.ai_model
  const aiModel =
    typeof rawModel === 'string' && rawModel.trim() ? rawModel.trim() : undefined

  const force = toBool(body.force)

  const baseArgs = {
    payload,
    siteId,
    force,
    ...(mainProductOverride ? { mainProductOverride } : {}),
    ...(aiModel ? { aiModel } : {}),
  }

  if (toBool(body.prepare)) {
    const prep = await prepareCategorySlotsForSite(baseArgs)
    if (!prep.ok) {
      return Response.json({ error: prep.message, code: prep.code }, { status: prep.status })
    }
    return Response.json({ ok: true, siteId: prep.siteId })
  }

  const result = await runCategorySlotsForSite({
    ...baseArgs,
    ...(toBool(body.afterPrepare) ? { afterPrepare: true } : {}),
  })

  if (!result.ok) {
    return Response.json({ error: result.message, code: result.code }, { status: result.status })
  }

  return Response.json({ ok: true, siteId: result.siteId })
}
