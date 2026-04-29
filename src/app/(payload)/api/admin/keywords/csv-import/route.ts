import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { parseCsvRows } from '@/utilities/csv'
import { getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 500

const STATUS_VALUES = new Set(['draft', 'active', 'archived'])

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

function docSiteId(doc: { site?: number | { id: number } | null }): number | null {
  const s = doc.site
  if (s == null) return null
  return typeof s === 'object' ? s.id : s
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const siteIdRaw = form.get('siteId')
  const siteId = typeof siteIdRaw === 'string' ? Number(siteIdRaw) : Number(siteIdRaw)

  if (!Number.isFinite(siteId)) {
    return Response.json({ error: 'siteId is required' }, { status: 400 })
  }

  if (!(file instanceof Blob)) {
    return Response.json({ error: 'file is required' }, { status: 400 })
  }

  const scope = getTenantScopeForStats(user)
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

  const rows = parseCsvRows(await file.text())
  if (rows.length < 2) {
    return Response.json({ error: 'CSV has no data rows' }, { status: 400 })
  }

  const headerCells = rows[0].map((h) => h.trim().toLowerCase())
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''))
  if (dataRows.length > MAX_ROWS) {
    return Response.json({ error: `At most ${MAX_ROWS} data rows` }, { status: 400 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }

  let created = 0
  let updated = 0
  const errors: { row: number; message: string }[] = []

  const col = (name: string, row: string[]): string => {
    const idx = headerCells.indexOf(name)
    if (idx < 0) return ''
    return row[idx] ?? ''
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const lineNum = i + 2
    while (row.length < headerCells.length) {
      row.push('')
    }

    const term = col('term', row).trim()
    if (!term) {
      errors.push({ row: lineNum, message: 'term is required' })
      continue
    }

    const idStr = col('id', row).trim()
    const slug = col('slug', row).trim()
    const notes = col('notes', row)
    const statusRaw = col('status', row).trim()

    if (statusRaw && !STATUS_VALUES.has(statusRaw)) {
      errors.push({ row: lineNum, message: 'invalid status' })
      continue
    }

    try {
      if (idStr) {
        const id = Number(idStr)
        if (!Number.isFinite(id)) {
          errors.push({ row: lineNum, message: 'invalid id' })
          continue
        }

        const existing = await payload.findByID({
          collection: 'keywords',
          id,
          depth: 0,
          user: userArg,
          overrideAccess: false,
        })
        if (!existing) {
          errors.push({ row: lineNum, message: 'document not found' })
          continue
        }
        if (docSiteId(existing) !== siteId) {
          errors.push({ row: lineNum, message: 'document does not belong to selected site' })
          continue
        }

        const data: Record<string, unknown> = { term }
        if (slug !== '') data.slug = slug
        data.notes = notes
        if (statusRaw) data.status = statusRaw

        await payload.update({
          collection: 'keywords',
          id,
          data,
          user: userArg,
          overrideAccess: false,
        })
        updated++
      } else {
        const data: Record<string, unknown> = {
          term,
          site: siteId,
          status: statusRaw ? statusRaw : 'draft',
        }
        if (slug) data.slug = slug
        if (notes) data.notes = notes

        await payload.create({
          collection: 'keywords',
          data: data as never,
          user: userArg,
          overrideAccess: false,
        })
        created++
      }
    } catch (e) {
      errors.push({
        row: lineNum,
        message: e instanceof Error ? e.message : 'save failed',
      })
    }
  }

  return Response.json({ created, updated, errors })
}
