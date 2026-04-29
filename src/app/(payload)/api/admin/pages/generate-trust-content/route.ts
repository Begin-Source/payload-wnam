import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  prepareSitePagesBundleForSite,
  runSitePagesBundleContentForSite,
} from '@/utilities/sitePagesBundleContent/runSitePagesBundleContentForSite'
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
 * POST { siteId: number, aiModel?: string, prepare?: boolean, afterPrepare?: boolean }
 * Trust page bundle (About/Contact/Privacy/Terms/Affiliate disclosure) — one OpenRouter call, five `en` pages.
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
    aiModel?: unknown
    ai_model?: unknown
    prepare?: unknown
    afterPrepare?: unknown
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
  const siteRow = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })
  if (!siteRow) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }

  const siteTenantId = tenantIdFromRelation(
    (siteRow as { tenant?: number | { id: number } | null }).tenant,
  )
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawModel = body.aiModel ?? body.ai_model
  const aiModel =
    typeof rawModel === 'string' && rawModel.trim() ? rawModel.trim() : undefined

  if (toBool(body.prepare)) {
    const prep = await prepareSitePagesBundleForSite({
      payload,
      siteId,
      ...(aiModel ? { aiModel } : {}),
    })
    if (!prep.ok) {
      return Response.json({ error: prep.message, code: prep.code }, { status: prep.status })
    }
    return Response.json({ ok: true, siteId: prep.siteId })
  }

  const result = await runSitePagesBundleContentForSite({
    payload,
    siteId,
    ...(aiModel ? { aiModel } : {}),
    ...(toBool(body.afterPrepare) ? { afterPrepare: true } : {}),
  })

  if (!result.ok) {
    return Response.json({ error: result.message, code: result.code }, { status: result.status })
  }

  return Response.json({ ok: true, siteId: result.siteId })
}
