import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { escapeCsvCell } from '@/utilities/csv'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const CSV_HEADER =
  'id,slug,title,level,status,summary,search_keywords,body_json,sort_order'

/**
 * 无 site 列：导出「当前用户可访问租户」内全部操作手册。
 * 超管（scope all）：不限租户；`combineTenantWhere` 为 `undefined` 时用空 where 表示全量。
 */
function whereForOperationManualsExport(
  scope: ReturnType<typeof getTenantScopeForStats>,
): Where {
  const combined = combineTenantWhere(scope)
  if (combined !== undefined) return combined
  if (scope.mode === 'all') return {}
  return { id: { equals: 0 } }
}

export async function GET(_request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: _request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)
  const where = whereForOperationManualsExport(scope)

  const userArg = user as Config['user'] & { collection: 'users' }

  const lines: string[] = [CSV_HEADER]
  const limit = 100
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: 'operation-manuals',
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
        escapeCsvCell(doc.level ?? ''),
        escapeCsvCell(doc.status ?? ''),
        escapeCsvCell(doc.summary == null ? '' : String(doc.summary)),
        escapeCsvCell(doc.searchKeywords == null ? '' : String(doc.searchKeywords)),
        escapeCsvCell(body),
        escapeCsvCell(doc.sortOrder == null ? '' : String(doc.sortOrder)),
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
      'Content-Disposition': `attachment; filename="operation-manuals-${stamp}.csv"`,
    },
  })
}
