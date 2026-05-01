import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

type PickerRow = {
  id: number
  kind: 'articles' | 'pages'
  title: string
  featuredImageId: number | null
}

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

function featuredImageIdFromDoc(doc: {
  featuredImage?: number | { id: number } | null
}): number | null {
  const fi = doc.featuredImage
  if (fi == null) return null
  if (typeof fi === 'number' && Number.isFinite(fi)) return fi
  if (typeof fi === 'object' && typeof fi.id === 'number') return fi.id
  return null
}

/**
 * GET — list articles/pages for Media AI picker (featuredImage → media IDs).
 * Query: siteId (req), categoryId (opt), kind=articles|pages|both, q, limit (≤250).
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)
  const url = new URL(request.url)
  const siteIdParam = url.searchParams.get('siteId')
  const siteId = siteIdParam != null && siteIdParam !== '' ? Number(siteIdParam) : NaN
  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }

  const siteTenantId = tenantIdFromRelation(site.tenant)
  if (!siteAccessible(scope, siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const categoryParam = url.searchParams.get('categoryId')
  const categoryId =
    categoryParam != null && categoryParam !== ''
      ? Number(categoryParam)
      : null
  if (categoryId != null && !Number.isFinite(categoryId)) {
    return Response.json({ error: 'Invalid categoryId' }, { status: 400 })
  }

  const kindRaw = (url.searchParams.get('kind') ?? 'articles').trim().toLowerCase()
  const kind = kindRaw === 'pages' ? 'pages' : kindRaw === 'both' ? 'both' : 'articles'

  const q = (url.searchParams.get('q') ?? '').trim()
  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Math.min(
    250,
    Math.max(1, Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 120),
  )

  const baseAnd: Record<string, unknown>[] = [{ site: { equals: siteId } }]
  if (categoryId != null) {
    baseAnd.push({ categories: { contains: categoryId } })
  }
  if (q.length > 0) {
    baseAnd.push({ title: { contains: q } })
  }

  const whereRoot =
    baseAnd.length === 1 ? baseAnd[0] : { and: baseAnd as never }

  const depth = 0

  async function fetchCollection(
    collection: 'articles' | 'pages',
    take: number,
  ): Promise<PickerRow[]> {
    const r = await payload.find({
      collection,
      limit: take,
      sort: 'title',
      depth,
      where: whereRoot as never,
    })
    return r.docs.map((doc) => ({
      id: doc.id as number,
      kind: collection,
      title: typeof (doc as { title?: string }).title === 'string' ? (doc as { title: string }).title : '',
      featuredImageId: featuredImageIdFromDoc(doc as { featuredImage?: unknown }),
    }))
  }

  let rows: PickerRow[] = []
  let truncated = false

  if (kind === 'articles') {
    const batch = await fetchCollection('articles', limit + 1)
    truncated = batch.length > limit
    rows = batch.slice(0, limit)
  } else if (kind === 'pages') {
    const batch = await fetchCollection('pages', limit + 1)
    truncated = batch.length > limit
    rows = batch.slice(0, limit)
  } else {
    const half = Math.ceil(limit / 2)
    const [a, p] = await Promise.all([
      fetchCollection('articles', half + 1),
      fetchCollection('pages', half + 1),
    ])
    const merged = [...a, ...p].sort((x, y) => x.title.localeCompare(y.title))
    truncated = merged.length > limit
    rows = merged.slice(0, limit)
  }

  return Response.json({
    rows,
    limit,
    truncated,
    kind,
    siteId,
  })
}
