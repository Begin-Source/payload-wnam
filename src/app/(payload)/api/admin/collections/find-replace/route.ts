import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import type { Config } from '@/payload-types'
import {
  FIND_REPLACE_COLLECTION_FIELDS,
  findReplaceRequiresSite,
  isFindReplaceCollectionSlug,
} from '@/constants/findReplaceCollections'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(
  scope: ReturnType<typeof getTenantScopeForStats>,
  siteTenantId: number | null,
): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

function buildWhere(
  scope: ReturnType<typeof getTenantScopeForStats>,
  siteId: number,
  field: string,
  find: string,
) {
  const scoped = combineTenantWhere(scope, {
    and: [{ site: { equals: siteId } }, { [field]: { contains: find } }],
  })
  return scoped ?? { id: { equals: 0 } }
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({
    config: configPromise,
  })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const collectionRaw = body.collection
  const collectionSlug =
    typeof collectionRaw === 'string' ? collectionRaw : String(collectionRaw ?? '')
  if (!isFindReplaceCollectionSlug(collectionSlug)) {
    return Response.json({ error: 'Invalid or unsupported collection' }, { status: 400 })
  }

  const allowed = FIND_REPLACE_COLLECTION_FIELDS[collectionSlug] as readonly string[]

  const fieldRaw = body.field
  const field = typeof fieldRaw === 'string' ? fieldRaw : ''
  if (!allowed.includes(field)) {
    return Response.json({ error: 'Invalid field' }, { status: 400 })
  }

  const find = typeof body.find === 'string' ? body.find : ''
  if (find.length === 0) {
    return Response.json({ error: 'find is required' }, { status: 400 })
  }

  const replace = typeof body.replace === 'string' ? body.replace : ''
  const dryRun = body.dryRun === true

  const scope = getTenantScopeForStats(user)

  const needsSite = findReplaceRequiresSite(collectionSlug)

  let where: Where

  if (needsSite) {
    const siteId = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
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

    where = buildWhere(scope, siteId, field, find)
  } else {
    const scoped = combineTenantWhere(scope, { [field]: { contains: find } })
    where = scoped ?? { id: { equals: 0 } }
  }

  const userArg = user as Config['user'] & { collection: 'users' }

  if (dryRun) {
    const total = await payload.count({
      collection: collectionSlug,
      where,
      user: userArg,
      overrideAccess: false,
    })

    const page = await payload.find({
      collection: collectionSlug,
      where,
      limit: 20,
      page: 1,
      user: userArg,
      overrideAccess: false,
      depth: 0,
    })

    const sample = page.docs.map((doc) => {
      const raw = doc[field as keyof typeof doc]
      const value = raw == null ? '' : String(raw)
      return {
        id: doc.id,
        preview: value.length > 120 ? `${value.slice(0, 120)}…` : value,
      }
    })

    return Response.json({
      matchCount: total.totalDocs,
      sample,
    })
  }

  const limit = 100
  let pageNum = 1
  let updatedCount = 0

  while (true) {
    const result = await payload.find({
      collection: collectionSlug,
      where,
      limit,
      page: pageNum,
      user: userArg,
      overrideAccess: false,
      depth: 0,
    })

    for (const doc of result.docs) {
      const raw = doc[field as keyof typeof doc]
      const str = raw == null ? '' : String(raw)
      if (!str.includes(find)) continue
      const next = str.replaceAll(find, replace)
      if (next === str) continue

      await payload.update({
        collection: collectionSlug,
        id: doc.id,
        data: { [field]: next } as Record<string, string>,
        user: userArg,
        overrideAccess: false,
      })
      updatedCount++
    }

    if (result.docs.length < limit) break
    pageNum++
  }

  return Response.json({ updatedCount })
}
