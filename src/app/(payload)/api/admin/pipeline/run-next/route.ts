import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runNextPendingJobs } from '@/utilities/pipelineRunNext'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'
import { userHasAllTenantAccess } from '@/utilities/superAdmin'

export const dynamic = 'force-dynamic'

/**
 * Super-admin-only bridge to run `/api/pipeline/tick` in a loop.
 * Responses never echo `PAYLOAD_SECRET`.
 */

async function requireSuperAdmin(request: Request): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      payload: Awaited<ReturnType<typeof getPayload>>
    }
> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (!userHasAllTenantAccess(user)) {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, payload }
}

export async function GET(request: Request): Promise<Response> {
  const g = await requireSuperAdmin(request)
  if (!g.ok) {
    return g.response
  }

  const { payload } = g
  const pendingRes = await payload.find({
    collection: 'workflow-jobs',
    where: { status: { equals: 'pending' } },
    limit: 2000,
    sort: 'createdAt',
    depth: 0,
    overrideAccess: true,
  })

  const totalPending = pendingRes.totalDocs
  const byType: Record<string, number> = {}
  for (const doc of pendingRes.docs) {
    const jt =
      typeof (doc as { jobType?: string }).jobType === 'string'
        ? (doc as { jobType: string }).jobType
        : 'unknown'
    byType[jt] = (byType[jt] ?? 0) + 1
  }

  return Response.json({
    ok: true,
    pending: totalPending,
    byType,
    byTypeTruncated: totalPending > pendingRes.docs.length,
  })
}

export async function POST(request: Request): Promise<Response> {
  const g = await requireSuperAdmin(request)
  if (!g.ok) {
    return g.response
  }

  if (!process.env.PAYLOAD_SECRET?.trim()) {
    return Response.json({ error: 'PAYLOAD_SECRET not configured' }, { status: 500 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const maxRunsRaw =
    typeof body.maxRuns === 'number' ? body.maxRuns : Number(body.maxRuns)
  const budgetMsRaw =
    typeof body.budgetMs === 'number'
      ? body.budgetMs
      : typeof body.budgetMs === 'string'
        ? Number(body.budgetMs)
        : typeof body.budgetSeconds === 'number'
          ? body.budgetSeconds * 1000
          : typeof body.budgetSeconds === 'string'
            ? Number(body.budgetSeconds) * 1000
            : Number.NaN

  const maxRuns = Number.isFinite(maxRunsRaw) ? maxRunsRaw : undefined
  const budgetMs = Number.isFinite(budgetMsRaw) ? budgetMsRaw : undefined
  const stopOnFailure =
    typeof body.stopOnFailure === 'boolean' ? body.stopOnFailure : true

  try {
    const origin = new URL(request.url).origin
    const out = await runNextPendingJobs({
      origin,
      maxRuns,
      budgetMs,
      stopOnFailure,
    })
    return Response.json(out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('PAYLOAD_SECRET')) {
      return Response.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    throw e
  }
}
