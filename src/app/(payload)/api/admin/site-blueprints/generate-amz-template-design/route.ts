import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  prepareAmzTemplateDesignForBlueprint,
  runAmzTemplateDesignForBlueprint,
} from '@/utilities/amzTemplateDesign/runAmzTemplateDesignForSite'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'
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
 * POST { blueprintId, mainProduct?, aiModel?, prepare?, afterPrepare?, fillSlots? }
 * fillSlots: truthy = flat copy-only whitelist regen (no full siteConfig in prompt).
 * Cookie session + tenant-scoped. OpenRouter rewrites linked blueprint amzSiteConfigJson for AMZ template sites (amz-template-1 / amz-template-2).
 * When prepare is true, validates and sets designWorkflowStatus running then returns immediately (modal closes; run job in background).
 * When afterPrepare is true, skips re-marking running (client already called prepare).
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
    blueprintId?: unknown
    mainProduct?: unknown
    aiModel?: unknown
    ai_model?: unknown
    prepare?: unknown
    afterPrepare?: unknown
    fillSlots?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const blueprintId =
    typeof body.blueprintId === 'number' ? body.blueprintId : Number(body.blueprintId)
  if (!Number.isFinite(blueprintId)) {
    return Response.json({ error: 'blueprintId is required' }, { status: 400 })
  }

  const scope = getTenantScopeForStats(user)
  const blueprintRow = await payload.findByID({
    collection: 'site-blueprints',
    id: blueprintId,
    depth: 0,
  })
  if (!blueprintRow) {
    return Response.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  const siteId = parseRelationshipId(
    (blueprintRow as { site?: unknown }).site,
  )
  const siteRow =
    siteId != null
      ? await payload.findByID({
          collection: 'sites',
          id: siteId,
          depth: 0,
        })
      : null

  const siteTenantId = tenantIdFromRelation(
    (siteRow as { tenant?: number | { id: number } | null } | null)?.tenant,
  )
  const blueprintTenantId = tenantIdFromRelation(
    (blueprintRow as { tenant?: number | { id: number } | null }).tenant,
  )
  const effectiveTenant = siteTenantId ?? blueprintTenantId

  if (!siteAccessible(scope, effectiveTenant)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawMain = body.mainProduct
  const mainProductOverride =
    typeof rawMain === 'string' && rawMain.trim() ? rawMain.trim() : undefined

  const rawModel = body.aiModel ?? body.ai_model
  const aiModel =
    typeof rawModel === 'string' && rawModel.trim() ? rawModel.trim() : undefined

  const fillSlots = toBool(body.fillSlots)

  if (toBool(body.prepare)) {
    const prep = await prepareAmzTemplateDesignForBlueprint({
      payload,
      blueprintId,
      ...(mainProductOverride ? { mainProductOverride } : {}),
      ...(aiModel ? { aiModel } : {}),
      fillSlots,
    })
    if (!prep.ok) {
      return Response.json({ error: prep.message, code: prep.code }, { status: prep.status })
    }
    return Response.json({ ok: true, blueprintId: prep.blueprintId })
  }

  const result = await runAmzTemplateDesignForBlueprint({
    payload,
    blueprintId,
    ...(mainProductOverride ? { mainProductOverride } : {}),
    ...(aiModel ? { aiModel } : {}),
    fillSlots,
    ...(toBool(body.afterPrepare) ? { afterPrepare: true } : {}),
  })

  if (!result.ok) {
    return Response.json({ error: result.message, code: result.code }, { status: result.status })
  }

  return Response.json({ ok: true, blueprintId: result.blueprintId })
}
