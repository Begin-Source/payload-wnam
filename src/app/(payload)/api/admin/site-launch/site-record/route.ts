import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { resolveTenantIdForCsvCreate } from '@/utilities/resolveTenantIdForCsvCreate'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const SITE_LAYOUTS = new Set(['template1', 'template2', 'amz-template-1', 'amz-template-2'])
const SITE_STATUSES = new Set(['draft', 'active', 'archived'])

function tenantIdFromRelation(tenant: number | { id: number } | null | undefined): number | null {
  if (tenant == null) return null
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

function parseSiteId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

function trimString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim().slice(0, max)
}

function relationSummary(raw: unknown): { id?: unknown; name?: unknown; slug?: unknown } | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: (raw as { id?: unknown }).id,
    name: (raw as { name?: unknown }).name,
    slug: (raw as { slug?: unknown }).slug,
  }
}

/**
 * POST { siteId?, fields } - create or update launch-facing editable fields on a site record.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: unknown
    fields?: Record<string, unknown>
  }

  const siteId = parseSiteId(body.siteId)
  const scope = getTenantScopeForStats(user)

  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {}
  const data: Record<string, unknown> = {}

  if ('name' in fields) {
    const name = trimString(fields.name, 120)
    if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
    data.name = name
  }

  if ('slug' in fields) {
    const slug = trimString(fields.slug, 120)
    if (slug) data.slug = slug
  }

  if ('primaryDomain' in fields) data.primaryDomain = trimString(fields.primaryDomain, 240) ?? ''
  if ('mainProduct' in fields) data.mainProduct = trimString(fields.mainProduct, 240) ?? ''
  if ('defaultAmazonTrackingId' in fields) {
    data.defaultAmazonTrackingId = trimString(fields.defaultAmazonTrackingId, 120) ?? ''
  }
  if ('notes' in fields) data.notes = trimString(fields.notes, 4000) ?? ''

  if ('siteLayout' in fields) {
    const siteLayout = trimString(fields.siteLayout, 80)
    if (!siteLayout || !SITE_LAYOUTS.has(siteLayout)) {
      return Response.json({ error: 'Invalid siteLayout' }, { status: 400 })
    }
    data.siteLayout = siteLayout
  }

  if ('status' in fields) {
    const status = trimString(fields.status, 40)
    if (!status || !SITE_STATUSES.has(status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = status
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'No site fields to update' }, { status: 400 })
  }

  if (siteId != null) {
    const current = await payload.findByID({
      collection: 'sites',
      id: String(siteId),
      depth: 1,
    })
    if (!current) {
      return Response.json({ error: 'Site not found' }, { status: 404 })
    }

    const siteTenantId = tenantIdFromRelation(
      (current as { tenant?: number | { id: number } | null }).tenant,
    )
    if (!siteAccessible(scope, siteTenantId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (scope.mode === 'none') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let site
  try {
    const tenantId =
      siteId == null ? await resolveTenantIdForCsvCreate(payload, user, scope, null) : null

    if (siteId == null && tenantId == null) {
      return Response.json(
        { error: '无法确定站点租户，请先给当前账号分配租户，或创建一个租户记录。' },
        { status: 400 },
      )
    }

    site =
      siteId != null
        ? await payload.update({
            collection: 'sites',
            id: String(siteId),
            data,
            depth: 1,
            overrideAccess: true,
          })
        : await payload.create({
            collection: 'sites',
            data: {
              ...data,
              tenant: tenantId,
            } as never,
            depth: 1,
            overrideAccess: true,
            user,
          })
  } catch (e) {
    const message = e instanceof Error ? e.message : '站点保存失败'
    console.error('[site-launch/site-record] failed to save site record', e)
    return Response.json({ error: message }, { status: 500 })
  }

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
      pipelineProfile: relationSummary((site as { pipelineProfile?: unknown }).pipelineProfile),
      keywordBatchPreset: relationSummary(
        (site as { keywordBatchPreset?: unknown }).keywordBatchPreset,
      ),
    },
  })
}
