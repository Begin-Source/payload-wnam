import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import type { Config } from '@/payload-types'
import {
  computeTeamStats,
  type TeamStatsSummaryJson,
  type TeamStatsSummaryRow,
} from '@/utilities/teamStatsScope'
import { tenantIdFromTeamData } from '@/utilities/teamsUserScope'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ ok: false, error: 'Unauthorized' } satisfies TeamStatsSummaryJson, {
      status: 401,
    })
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const req = { user: userArg, payload }

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50))
  const tenantParam = url.searchParams.get('tenantId')
  const tenantFilter =
    tenantParam != null && tenantParam !== '' && Number.isFinite(Number(tenantParam))
      ? Number(tenantParam)
      : null

  const where =
    tenantFilter != null
      ? {
          tenant: { equals: tenantFilter },
        }
      : undefined

  let findResult: Awaited<ReturnType<typeof payload.find>>
  try {
    findResult = await payload.find({
      collection: 'teams',
      where,
      depth: 0,
      limit,
      page,
      pagination: true,
      sort: 'name',
      user: userArg,
      overrideAccess: false,
    })
  } catch {
    return Response.json({ ok: false, error: 'Forbidden' } satisfies TeamStatsSummaryJson, {
      status: 403,
    })
  }

  const rows: TeamStatsSummaryRow[] = []
  for (const doc of findResult.docs) {
    const record = doc as Record<string, unknown>
    const id = typeof record.id === 'number' ? record.id : Number(record.id)
    if (!Number.isFinite(id)) continue
    const name = typeof record.name === 'string' ? record.name : ''
    const tenantId = tenantIdFromTeamData(record)
    const stats = await computeTeamStats(payload, req, record)
    rows.push({ id, name, tenantId, stats })
  }

  const body: TeamStatsSummaryJson = {
    ok: true,
    rows,
    totalDocs: findResult.totalDocs,
    page: findResult.page ?? page,
    totalPages: findResult.totalPages ?? 1,
    hasNextPage: Boolean(findResult.hasNextPage),
    hasPrevPage: Boolean(findResult.hasPrevPage),
    limit,
  }

  return Response.json(body)
}
