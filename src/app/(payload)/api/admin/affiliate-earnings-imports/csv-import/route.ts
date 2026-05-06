import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { parseAmazonAssociatesReport } from '@/utilities/amazonAssociatesSpreadsheet'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userMayWriteCommissions } from '@/utilities/financeRoleAccess'
import { resolveTenantIdForCsvCreate } from '@/utilities/resolveTenantIdForCsvCreate'
import { getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 2000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function userAssignedToTenant(
  doc: { tenants?: Array<{ tenant?: number | { id: number } | null }> | null },
  tenantId: number,
): boolean {
  const rows = doc.tenants
  if (!Array.isArray(rows)) return false
  for (const row of rows) {
    const t = row?.tenant
    const id = typeof t === 'number' ? t : typeof t === 'object' && t?.id != null ? t.id : null
    if (id === tenantId) return true
  }
  return false
}

function recipientMapForTenant(
  docs: Array<{
    id: number
    amazonTrackingId?: string | null
    tenants?: Array<{ tenant?: number | { id: number } | null }> | null
  }>,
  tenantId: number,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const u of docs) {
    const tag = typeof u.amazonTrackingId === 'string' ? u.amazonTrackingId.trim().toLowerCase() : ''
    if (!tag) continue
    if (!userAssignedToTenant(u, tenantId)) continue
    if (!m.has(tag)) m.set(tag, u.id)
  }
  return m
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!userMayWriteCommissions(user)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }

  const form = await request.formData()
  const file = form.get('file')
  const periodStartRaw = form.get('periodStart')
  const periodEndRaw = form.get('periodEnd')
  const tenantIdFromForm = form.get('tenantId')
  const formTenantIdStr = typeof tenantIdFromForm === 'string' ? tenantIdFromForm : null
  const replaceRaw = form.get('replaceSamePeriod')
  const replaceSamePeriod =
    typeof replaceRaw === 'string' ? replaceRaw !== 'false' && replaceRaw !== '0' : true

  if (!(file instanceof Blob)) {
    return Response.json({ error: 'file is required' }, { status: 400 })
  }

  const periodStart = typeof periodStartRaw === 'string' ? periodStartRaw.trim() : ''
  const periodEnd = typeof periodEndRaw === 'string' ? periodEndRaw.trim() : ''
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
    return Response.json(
      { error: 'periodStart and periodEnd must be YYYY-MM-DD' },
      { status: 400 },
    )
  }

  const scope = getTenantScopeForStats(userArg)
  if (scope.mode === 'none') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = await resolveTenantIdForCsvCreate(payload, userArg, scope, formTenantIdStr)
  if (tenantId == null) {
    return Response.json(
      {
        error:
          '无法确定目标租户。请在管理后台左上角先选择租户，或在表单中选择租户（tenantId）。',
      },
      { status: 400 },
    )
  }

  if (scope.mode === 'tenants' && !scope.tenantIds.includes(tenantId)) {
    return Response.json({ error: '租户不在您的权限范围内' }, { status: 403 })
  }

  const text = await file.text()
  const parsed = parseAmazonAssociatesReport(text)
  if (!parsed.ok) {
    return Response.json({ ok: false, errors: parsed.errors }, { status: 422 })
  }

  if (parsed.rows.length > MAX_ROWS) {
    return Response.json({ error: `最多导入 ${MAX_ROWS} 行` }, { status: 400 })
  }

  const tagKeys = [...new Set(parsed.rows.map((r) => r.trackingId.trim().toLowerCase()))]
  let recipientsByTag = new Map<string, number>()
  if (tagKeys.length > 0) {
    const usersRes = await payload.find({
      collection: 'users',
      where: { amazonTrackingId: { in: tagKeys } },
      limit: Math.min(500, Math.max(tagKeys.length * 4, 50)),
      depth: 0,
      user: userArg,
      overrideAccess: false,
    })
    recipientsByTag = recipientMapForTenant(usersRes.docs as never[], tenantId)
  }

  const fileName =
    typeof (file as File).name === 'string' && (file as File).name.trim()
      ? (file as File).name.trim()
      : 'amazon-earnings.csv'

  let deletedImports = 0

  try {
    if (replaceSamePeriod) {
      const existing = await payload.find({
        collection: 'affiliate-earnings-imports',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { periodStart: { equals: periodStart } },
            { periodEnd: { equals: periodEnd } },
          ],
        },
        limit: 50,
        depth: 0,
        user: userArg,
        overrideAccess: false,
      })
      for (const doc of existing.docs) {
        await payload.delete({
          collection: 'affiliate-earnings-imports',
          id: doc.id,
          user: userArg,
          overrideAccess: false,
        })
        deletedImports++
      }
    }

    const gross = parsed.rows.reduce(
      (sum, r) => sum + (typeof r.totalEarningsUsd === 'number' ? r.totalEarningsUsd : 0),
      0,
    )

    const batch = await payload.create({
      collection: 'affiliate-earnings-imports',
      data: {
        tenant: tenantId,
        source: 'amazon_associates',
        periodStart,
        periodEnd,
        fileName,
        importedBy: userArg.id,
        rowsCount: 0,
        grossEarningsUsd: 0,
        rawSummaryJson: JSON.stringify({
          deletedImportsPrior: deletedImports,
          rowsParsed: parsed.rows.length,
          grossPreviewUsd: gross,
          importedAt: new Date().toISOString(),
        }),
      },
      user: userArg,
      overrideAccess: false,
    })

    const batchId = batch.id as number

    try {
      for (const row of parsed.rows) {
        const tagLower = row.trackingId.trim().toLowerCase()
        const recipientId = recipientsByTag.get(tagLower)

        await payload.create({
          collection: 'affiliate-earnings-rows',
          data: {
            tenant: tenantId,
            batch: batchId,
            trackingId: row.trackingId.trim(),
            ...(recipientId != null ? { recipient: recipientId } : {}),
            clicks: row.clicks,
            itemsOrdered: row.itemsOrdered,
            orderedRevenueUsd: row.orderedRevenueUsd,
            itemsShipped: row.itemsShipped,
            itemsReturned: row.itemsReturned,
            shippedRevenueUsd: row.shippedRevenueUsd,
            returnedRevenueUsd: row.returnedRevenueUsd,
            totalEarningsUsd: row.totalEarningsUsd,
            bonusUsd: row.bonusUsd,
            shippedEarningsUsd: row.shippedEarningsUsd,
            returnedEarningsUsd: row.returnedEarningsUsd,
            periodStart,
            periodEnd,
            rawJson: JSON.stringify(row.rawCells),
          },
          user: userArg,
          overrideAccess: false,
        })
      }

      await payload.update({
        collection: 'affiliate-earnings-imports',
        id: batchId,
        data: {
          rowsCount: parsed.rows.length,
          grossEarningsUsd: gross,
        },
        user: userArg,
        overrideAccess: false,
      })

      return Response.json({
        ok: true,
        batchId,
        rowsImported: parsed.rows.length,
        grossEarningsUsd: gross,
        deletedImports,
        unmatchedTrackingRows: parsed.rows.filter(
          (r) => !recipientsByTag.has(r.trackingId.trim().toLowerCase()),
        ).length,
      })
    } catch (inner) {
      try {
        await payload.delete({
          collection: 'affiliate-earnings-imports',
          id: batchId,
          user: userArg,
          overrideAccess: false,
        })
      } catch {
        /* rollback best-effort */
      }
      throw inner
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'import failed'
    await payload.logger.error({ err: msg }, 'affiliate_earnings_csv_import_failed')
    return Response.json({ ok: false, error: msg }, { status: 502 })
  }
}
