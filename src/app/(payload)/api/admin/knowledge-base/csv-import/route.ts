import { cookies } from 'next/headers.js'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { parseCsvRows } from '@/utilities/csv'
import { PAYLOAD_TENANT_COOKIE } from '@/utilities/knowledgePortalTenant'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantIdsForUser, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 500

const STATUS_VALUES = new Set(['draft', 'published', 'archived'])
const ENTRY_TYPE_VALUES = new Set([
  'research',
  'audit',
  'monitoring',
  'decision',
  'open_loop',
  'hot_cache',
])
const SEVERITY_VALUES = new Set(['info', 'warn', 'veto'])

type Scope = ReturnType<typeof getTenantScopeForStats>

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(scope: Scope, siteTenantId: number | null): boolean {
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

function docTenantId(doc: { tenant?: number | { id: number } | null }): number | null {
  const t = doc.tenant
  if (t == null || t === undefined) return null
  return typeof t === 'object' ? t.id : t
}

function canUpdateKbForSite(
  existing: {
    site?: number | { id: number } | null
    tenant?: number | { id: number } | null
  },
  siteId: number,
  siteTenantId: number | null,
): boolean {
  const sid = docSiteId(existing)
  if (sid === siteId) return true
  if (sid == null && siteTenantId != null && docTenantId(existing) === siteTenantId) {
    return true
  }
  return false
}

/**
 * 新建无 site 的 knowledge-base 行需要 `tenant`；有 site 时从站点可推导，为稳妥也可显式写入。
 * 与 operation-manuals csv-import 同源逻辑。
 */
async function resolveDefaultTenantIdForCreate(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: Config['user'] & { collection: 'users' },
  scope: Scope,
  formTenantIdRaw: string | null,
): Promise<number | null> {
  const formTid = formTenantIdRaw?.trim()
  if (formTid) {
    const n = Number(formTid)
    if (Number.isFinite(n)) {
      if (scope.mode === 'tenants' && !scope.tenantIds.includes(n)) {
        return null
      }
      return n
    }
  }
  const raw = (await cookies()).get(PAYLOAD_TENANT_COOKIE)?.value
  const fromCookie =
    raw != null && raw !== '' && !Number.isNaN(parseInt(raw, 10)) ? parseInt(raw, 10) : null
  const assigned = getTenantIdsForUser(user)
  if (scope.mode === 'tenants') {
    if (scope.tenantIds.length === 0) return null
    if (scope.tenantIds.length === 1) return scope.tenantIds[0]!
    if (fromCookie != null && scope.tenantIds.includes(fromCookie)) return fromCookie
    return scope.tenantIds[0]!
  }
  if (scope.mode === 'all' && userHasUnscopedAdminAccess(user)) {
    if (fromCookie != null) return fromCookie
    if (assigned.length > 0) return assigned[0]!
    const t = await payload.find({ collection: 'tenants', limit: 1, depth: 0, overrideAccess: true })
    const id = t.docs[0]?.id
    return typeof id === 'number' ? id : null
  }
  if (fromCookie != null) return fromCookie
  if (assigned.length > 0) return assigned[0]!
  return null
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const importAll = form.get('importAll') === '1'
  const formTenantIdStr = typeof form.get('tenantId') === 'string' ? form.get('tenantId') : null
  const siteIdRaw = form.get('siteId')
  const siteId =
    siteIdRaw != null && String(siteIdRaw).trim() !== '' && String(siteIdRaw) !== 'undefined'
      ? Number(siteIdRaw)
      : Number.NaN

  if (!(file instanceof Blob)) {
    return Response.json({ error: 'file is required' }, { status: 400 })
  }

  const scope = getTenantScopeForStats(user)
  if (scope.mode === 'none') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }

  let requestSiteId: number
  let requestSiteTenantId: number | null
  let defaultTenantForNoSite: number | null = null

  if (importAll) {
    defaultTenantForNoSite = await resolveDefaultTenantIdForCreate(
      payload,
      userArg,
      scope,
      formTenantIdStr as string | null,
    )
    if (defaultTenantForNoSite == null) {
      return Response.json(
        {
          error:
            '无法确定目标租户。导入全部时请在 Admin 先选租户、或传 tenantId；无绑定时需库中至少存在租户。',
        },
        { status: 400 },
      )
    }
    requestSiteId = 0
    requestSiteTenantId = null
  } else {
    if (!Number.isFinite(siteId)) {
      return Response.json({ error: 'siteId is required unless importAll=1' }, { status: 400 })
    }
    const site = await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
    })
    if (!site) {
      return Response.json({ error: 'Site not found' }, { status: 404 })
    }
    requestSiteTenantId = tenantIdFromRelation(site.tenant)
    if (!siteAccessible(scope, requestSiteTenantId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    requestSiteId = siteId
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

  let created = 0
  let updated = 0
  const errors: { row: number; message: string }[] = []

  const col = (name: string, row: string[]): string => {
    const idx = headerCells.indexOf(name.toLowerCase())
    if (idx < 0) return ''
    return row[idx] ?? ''
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const lineNum = i + 2
    while (row.length < headerCells.length) {
      row.push('')
    }

    const siteIdFromCsv = col('site_id', row).trim()

    const title = col('title', row).trim()
    if (!title) {
      errors.push({ row: lineNum, message: 'title is required' })
      continue
    }

    const idStr = col('id', row).trim()
    const slug = col('slug', row).trim()
    const notes = col('notes', row)
    const statusRaw = col('status', row).trim()
    const bodyJson = col('body_json', row).trim()
    const entryTypeRaw = col('entry_type', row).trim()
    const skillId = col('skill_id', row).trim()
    const subject = col('subject', row).trim()
    const summary = col('summary', row)
    const payloadJson = col('payload_json', row).trim()
    const severityRaw = col('severity', row).trim()
    const expiresAtRaw = col('expires_at', row).trim()
    const artifactClass = col('artifact_class', row).trim()

    let rowSiteId: number
    let rowSiteTenantId: number | null

    if (importAll) {
      if (siteIdFromCsv === '') {
        rowSiteId = 0
        rowSiteTenantId = defaultTenantForNoSite
      } else {
        const rid = Number(siteIdFromCsv)
        if (!Number.isFinite(rid)) {
          errors.push({ row: lineNum, message: 'invalid site_id' })
          continue
        }
        const sdoc = await payload.findByID({ collection: 'sites', id: rid, depth: 0 })
        if (!sdoc) {
          errors.push({ row: lineNum, message: 'site not found' })
          continue
        }
        const st = tenantIdFromRelation(sdoc.tenant)
        if (!siteAccessible(scope, st)) {
          errors.push({ row: lineNum, message: 'site not in tenant scope' })
          continue
        }
        rowSiteId = rid
        rowSiteTenantId = st
      }
    } else {
      rowSiteId = requestSiteId
      rowSiteTenantId = requestSiteTenantId
    }

    let body: unknown = undefined
    if (bodyJson) {
      try {
        body = JSON.parse(bodyJson) as unknown
      } catch {
        errors.push({ row: lineNum, message: 'invalid body_json' })
        continue
      }
    }

    let payloadField: unknown = undefined
    if (payloadJson) {
      try {
        payloadField = JSON.parse(payloadJson) as unknown
      } catch {
        errors.push({ row: lineNum, message: 'invalid payload_json' })
        continue
      }
    }

    if (statusRaw && !STATUS_VALUES.has(statusRaw)) {
      errors.push({ row: lineNum, message: 'invalid status' })
      continue
    }
    if (entryTypeRaw && !ENTRY_TYPE_VALUES.has(entryTypeRaw)) {
      errors.push({ row: lineNum, message: 'invalid entry_type' })
      continue
    }
    if (severityRaw && !SEVERITY_VALUES.has(severityRaw)) {
      errors.push({ row: lineNum, message: 'invalid severity' })
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
          collection: 'knowledge-base',
          id,
          depth: 0,
          user: userArg,
          overrideAccess: false,
        })
        if (!existing) {
          errors.push({ row: lineNum, message: 'document not found' })
          continue
        }

        const forCheckSiteId = importAll ? (siteIdFromCsv === '' ? 0 : rowSiteId) : requestSiteId
        const forCheckSiteTenant: number | null = importAll
          ? siteIdFromCsv === ''
            ? (docTenantId(existing) ?? defaultTenantForNoSite)
            : rowSiteTenantId
          : requestSiteTenantId

        if (!canUpdateKbForSite(existing, forCheckSiteId, forCheckSiteTenant)) {
          errors.push({ row: lineNum, message: 'document not in scope for this site/tenant' })
          continue
        }

        const data: Record<string, unknown> = { title }
        if (slug !== '') data.slug = slug
        data.notes = notes
        if (statusRaw) data.status = statusRaw
        if (body !== undefined) data.body = body
        if (entryTypeRaw) data.entryType = entryTypeRaw
        data.skillId = skillId || null
        data.subject = subject
        data.summary = summary
        if (payloadField !== undefined) data.payload = payloadField
        if (severityRaw) data.severity = severityRaw
        if (expiresAtRaw) data.expiresAt = expiresAtRaw
        data.artifactClass = artifactClass || null

        await payload.update({
          collection: 'knowledge-base',
          id,
          data,
          user: userArg,
          overrideAccess: false,
        })
        updated++
      } else {
        const data: Record<string, unknown> = {
          title,
          status: statusRaw ? statusRaw : 'draft',
        }
        if (importAll) {
          if (siteIdFromCsv === '') {
            data.tenant = defaultTenantForNoSite
          } else {
            data.site = rowSiteId
            const tid = rowSiteTenantId
            if (tid != null) {
              data.tenant = tid
            }
          }
        } else {
          data.site = requestSiteId
        }
        if (slug) data.slug = slug
        if (notes) data.notes = notes
        if (body !== undefined) data.body = body
        if (entryTypeRaw) data.entryType = entryTypeRaw
        if (skillId) data.skillId = skillId
        if (subject) data.subject = subject
        if (summary) data.summary = summary
        if (payloadField !== undefined) data.payload = payloadField
        if (severityRaw) data.severity = severityRaw
        if (expiresAtRaw) data.expiresAt = expiresAtRaw
        if (artifactClass) data.artifactClass = artifactClass

        await payload.create({
          collection: 'knowledge-base',
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
