import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  markSiteDomainWorkflowRunning,
  runDomainGenerationForSite,
} from '@/utilities/domainGeneration/runDomainGenerationForSite'
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
 * POST { siteId: number, prepare?: boolean, force?: boolean, ai_model?: string, mainProduct?: string }
 * Cookie session + tenant-scoped; runs n8n-equivalent domain generation for one site.
 * When prepare is true, only marks domainWorkflowStatus running and returns immediately.
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
    force?: unknown
    prepare?: unknown
    ai_model?: unknown
    aiModel?: unknown
    mainProduct?: unknown
    main_product?: unknown
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

  const force = toBool(body.force)
  const rawModel = body.ai_model ?? body.aiModel
  const aiModel =
    typeof rawModel === 'string' && rawModel.trim()
      ? rawModel.trim()
      : 'google/gemini-2.5-flash'

  const rawMain =
    body.mainProduct !== undefined && body.mainProduct !== null
      ? body.mainProduct
      : body.main_product
  const mainProductFromBody =
    typeof rawMain === 'string' && rawMain.trim() ? rawMain.trim() : null

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

  if (toBool(body.prepare)) {
    const marked = await markSiteDomainWorkflowRunning(payload, siteId)
    if (!marked) {
      return Response.json({ error: 'Failed to update site status' }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  const r = await runDomainGenerationForSite(payload, siteId, {
    force,
    aiModel,
    ...(mainProductFromBody ? { mainProduct: mainProductFromBody } : {}),
  })
  if (r.ok) {
    return Response.json({
      ok: true,
      site_id: r.detail.site_id,
      force: r.detail.force,
      current_domain: r.detail.current_domain,
      applied_domain: r.detail.applied_domain,
      selected_audience: r.detail.selected_audience,
      selected_domain: r.detail.selected_domain,
      available_domains: r.detail.available_domains,
      checked_domains: r.detail.checked_domains,
      status: r.detail.status,
      message: r.detail.message,
    })
  }
  return Response.json({ ok: false, site_id: r.siteId, error: r.error }, { status: 422 })
}
