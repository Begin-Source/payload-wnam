import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { parseRelationshipId } from '@/utilities/parseRelationshipId'
import { getTenantScopeForStats } from '@/utilities/tenantScope'
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

function clip(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string' || !s.trim()) return undefined
  const t = s.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function parseIds(raw: string | null): number[] {
  if (!raw?.trim()) return []
  const out: number[] = []
  for (const part of raw.split(',')) {
    const n = Number(part.trim())
    if (Number.isFinite(n)) out.push(Math.floor(n))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/**
 * GET ?siteId=&batchId=&categoryIds=1,2,3
 * Admin-auth read of Categories merchant-offer-fetch workflow rows for polling post-dispatch webhook completion.
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const siteIdRaw = url.searchParams.get('siteId')
  const batchIdRaw = url.searchParams.get('batchId')
  const idsRaw = url.searchParams.get('categoryIds')

  const siteId = typeof siteIdRaw === 'string' ? Number(siteIdRaw.trim()) : NaN
  if (!Number.isFinite(siteId)) {
    return Response.json({ ok: false, error: 'siteId is required' }, { status: 400 })
  }

  const batchId = typeof batchIdRaw === 'string' ? batchIdRaw.trim() : ''
  if (!batchId) {
    return Response.json({ ok: false, error: 'batchId is required' }, { status: 400 })
  }

  const categoryIds = parseIds(idsRaw)
  if (categoryIds.length === 0) {
    return Response.json({ ok: false, error: 'categoryIds is required' }, { status: 400 })
  }

  const scope = getTenantScopeForStats(user)
  const siteRow = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })
  if (!siteRow) {
    return Response.json({ ok: false, error: 'Site not found' }, { status: 404 })
  }
  const siteTenantId = tenantIdFromRelation((siteRow as { tenant?: number | { id: number } | null }).tenant)
  if (scope.mode === 'none') {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  if (
    scope.mode === 'tenants' &&
    (siteTenantId == null || !scope.tenantIds.includes(siteTenantId))
  ) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const categories: Array<{
    categoryId: number
    merchantOfferFetchWorkflowStatus: string | null
    batchMatches: boolean
    logSnippet?: string
  }> = []

  for (const categoryId of categoryIds) {
    let cat: Awaited<ReturnType<typeof payload.findByID>> | null
    try {
      cat = await payload.findByID({
        collection: 'categories',
        id: categoryId,
        depth: 0,
      })
    } catch {
      cat = null
    }
    if (!cat) {
      categories.push({
        categoryId,
        merchantOfferFetchWorkflowStatus: null,
        batchMatches: false,
        logSnippet: 'Category not found',
      })
      continue
    }

    const catSite = parseRelationshipId((cat as { site?: unknown }).site)
    if (catSite !== siteId) {
      categories.push({
        categoryId,
        merchantOfferFetchWorkflowStatus: String(
          (cat as { merchantOfferFetchWorkflowStatus?: unknown }).merchantOfferFetchWorkflowStatus ?? '',
        ).trim(),
        batchMatches: false,
        logSnippet: 'Category site mismatch',
      })
      continue
    }

    const lastBatch = String(
      (cat as { merchantOfferFetchLastBatchId?: unknown }).merchantOfferFetchLastBatchId ?? '',
    ).trim()
    const wf = String((cat as { merchantOfferFetchWorkflowStatus?: unknown }).merchantOfferFetchWorkflowStatus ?? '').trim()
    categories.push({
      categoryId,
      merchantOfferFetchWorkflowStatus: wf || null,
      batchMatches: lastBatch === batchId,
      ...(() => {
        const log = clip((cat as { merchantOfferFetchWorkflowLog?: unknown }).merchantOfferFetchWorkflowLog, 400)
        return log ? { logSnippet: log } : {}
      })(),
    })
  }

  return Response.json({ ok: true, siteId, batchId, categories })
}
