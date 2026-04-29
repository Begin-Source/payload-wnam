import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { escapeCsvCell } from '@/utilities/csv'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const CSV_HEADER = 'id,slug,title,excerpt,status,publishedAt,body_json'

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

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const exportAll = url.searchParams.get('all') === '1'

  const scope = getTenantScopeForStats(user)

  let where: ReturnType<typeof combineTenantWhere> | { id: { equals: number } }

  if (exportAll) {
    where = combineTenantWhere(scope) ?? { id: { equals: 0 } }
  } else {
    const siteId = Number(url.searchParams.get('siteId'))
    if (!Number.isFinite(siteId)) {
      return Response.json({ error: 'siteId is required unless all=1' }, { status: 400 })
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

    where = combineTenantWhere(scope, { site: { equals: siteId } }) ?? { id: { equals: 0 } }
  }
  const userArg = user as Config['user'] & { collection: 'users' }

  const lines: string[] = [CSV_HEADER]
  const limit = 100
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: 'articles',
      where,
      limit,
      page,
      depth: 0,
      user: userArg,
      overrideAccess: false,
    })

    for (const doc of result.docs) {
      const body =
        doc.body != null && typeof doc.body === 'object' ? JSON.stringify(doc.body) : ''
      const row = [
        String(doc.id),
        escapeCsvCell(doc.slug == null ? '' : String(doc.slug)),
        escapeCsvCell(doc.title ?? ''),
        escapeCsvCell(doc.excerpt == null ? '' : String(doc.excerpt)),
        escapeCsvCell(doc.status ?? ''),
        escapeCsvCell(doc.publishedAt == null ? '' : String(doc.publishedAt)),
        escapeCsvCell(body),
      ].join(',')
      lines.push(row)
    }

    if (result.docs.length < limit) break
    page++
  }

  const csv = '\uFEFF' + lines.join('\r\n')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="articles-${stamp}.csv"`,
    },
  })
}
