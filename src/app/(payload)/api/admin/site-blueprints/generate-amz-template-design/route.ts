import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Site, SiteBlueprint } from '@/payload-types'
import {
  prepareAmzTemplateDesignForBlueprint,
  runAmzTemplateDesignForBlueprint,
} from '@/utilities/amzTemplateDesign/runAmzTemplateDesignForSite'
import { slugify } from '@/utilities/offerReviewMdx/offerReviewSlug'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(tenant: number | { id: number } | null | undefined): number | null {
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

async function resolveBlueprintIdForSite(args: {
  payload: Awaited<ReturnType<typeof getPayload>>
  site: Site
}): Promise<number> {
  const { payload, site } = args
  const existing = await payload.find({
    collection: 'site-blueprints',
    where: { site: { equals: site.id } },
    limit: 1,
    sort: '-updatedAt',
    depth: 0,
  })
  const first = existing.docs[0] as SiteBlueprint | undefined
  if (typeof first?.id === 'number') return first.id

  const baseSlug = slugify(site.slug || site.primaryDomain || site.name || `site-${site.id}`)
  const blueprintSlug = `${baseSlug || `site-${site.id}`}-design`
  const created = (await payload.create({
    collection: 'site-blueprints',
    data: {
      name: `${site.name || site.slug || `Site ${site.id}`} Design`,
      slug: blueprintSlug,
      site: site.id,
      description: '站点启动面板自动创建的设计记录。',
    } as never,
  })) as SiteBlueprint

  return created.id
}

/**
 * POST { blueprintId?, siteId?, mainProduct?, aiModel?, prepare?, afterPrepare?, fillSlots? }
 * fillSlots: truthy = flat copy-only whitelist regen (no full siteConfig in prompt).
 * Cookie session + tenant-scoped. OpenRouter rewrites linked blueprint amzSiteConfigJson for AMZ template sites (amz-template-1 / amz-template-2).
 * `siteId` is accepted for launch-panel flows; it reuses the latest blueprint for that site or creates one.
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
    siteId?: unknown
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

  const scope = getTenantScopeForStats(user)

  let blueprintId =
    typeof body.blueprintId === 'number' ? body.blueprintId : Number(body.blueprintId)
  let effectiveTenant: number | null = null

  if (!Number.isFinite(blueprintId)) {
    const siteId = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
    if (!Number.isFinite(siteId)) {
      return Response.json({ error: 'blueprintId or siteId is required' }, { status: 400 })
    }

    const siteRow = (await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
    })) as Site | null
    if (!siteRow) {
      return Response.json({ error: 'Site not found' }, { status: 404 })
    }

    effectiveTenant = tenantIdFromRelation(
      (siteRow as { tenant?: number | { id: number } | null }).tenant,
    )
    if (!siteAccessible(scope, effectiveTenant)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    blueprintId = await resolveBlueprintIdForSite({ payload, site: siteRow })
  } else {
    const blueprintRow = await payload.findByID({
      collection: 'site-blueprints',
      id: blueprintId,
      depth: 0,
    })
    if (!blueprintRow) {
      return Response.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    const siteId = parseRelationshipId((blueprintRow as { site?: unknown }).site)
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
    effectiveTenant = siteTenantId ?? blueprintTenantId
  }

  if (!siteAccessible(scope, effectiveTenant)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawMain = body.mainProduct
  const mainProductOverride =
    typeof rawMain === 'string' && rawMain.trim() ? rawMain.trim() : undefined

  const rawModel = body.aiModel ?? body.ai_model
  const aiModel = typeof rawModel === 'string' && rawModel.trim() ? rawModel.trim() : undefined

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
      const failed = prep as { message: string; code?: string; status: number }
      return Response.json({ error: failed.message, code: failed.code }, { status: failed.status })
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
    const failed = result as { message: string; code?: string; status: number }
    return Response.json({ error: failed.message, code: failed.code }, { status: failed.status })
  }

  return Response.json({ ok: true, blueprintId: result.blueprintId })
}
