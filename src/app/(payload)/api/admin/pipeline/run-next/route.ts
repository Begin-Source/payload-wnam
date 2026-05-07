import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runNextPendingJobs } from '@/utilities/pipelineRunNext'
import { userHasPipelineRunNextAccess } from '@/utilities/userRoles'
import {
  buildPendingConstrainedWhere,
  MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
  normalizeConstrainedJobIds,
  parseConstrainedIdsFromCommaQuery,
} from '@/utilities/workflowJobTickConstraints'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

import type { Config } from '@/payload-types'

export const dynamic = 'force-dynamic'

/**
 * Staff (any role beyond plain `user`) bridge to run `/api/pipeline/tick` in a loop.
 * Responses never echo `PAYLOAD_SECRET`.
 */

async function requirePipelineRunNextAccess(request: Request): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      payload: Awaited<ReturnType<typeof getPayload>>
      user: Config['user'] & { collection: 'users' }
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
  if (!userHasPipelineRunNextAccess(user)) {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, payload, user }
}

export async function GET(request: Request): Promise<Response> {
  const g = await requirePipelineRunNextAccess(request)
  if (!g.ok) {
    return g.response
  }

  const { payload, user } = g
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids')

  if (!idsParam || idsParam.trim() === '') {
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
      scope: 'global',
    })
  }

  const parsed = parseConstrainedIdsFromCommaQuery(idsParam)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }

  const pendingRes = await payload.find({
    collection: 'workflow-jobs',
    where: buildPendingConstrainedWhere(parsed.ids),
    limit: MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
    sort: 'createdAt',
    depth: 0,
    overrideAccess: false,
    user,
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
    scope: 'selected',
    requestedJobIdsCount: parsed.ids.length,
    ...(parsed.truncated ? { constrainedJobIdsTruncated: true } : {}),
  })
}

export async function POST(request: Request): Promise<Response> {
  const g = await requirePipelineRunNextAccess(request)
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

  const jobNorm = normalizeConstrainedJobIds(body.jobIds)
  if (!jobNorm.ok) {
    return Response.json({ error: jobNorm.error }, { status: 400 })
  }

  try {
    const origin = new URL(request.url).origin
    const { payload, user } = g

    if (jobNorm.ids.length === 0) {
      const out = await runNextPendingJobs({
        origin,
        maxRuns,
        budgetMs,
        stopOnFailure,
      })
      return Response.json(out)
    }

    const pendingRes = await payload.find({
      collection: 'workflow-jobs',
      where: buildPendingConstrainedWhere(jobNorm.ids),
      sort: 'createdAt',
      limit: MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
      depth: 0,
      overrideAccess: false,
      user,
    })

    const allowedIds = pendingRes.docs.map((d) => d.id)

    if (allowedIds.length === 0) {
      return Response.json({
        ok: true,
        totalRuns: 0,
        runs: [],
        stoppedReason: 'no_pending',
        message:
          '所选任务中没有处于 pending 状态，或不在当前账号可见范围内（可能非 pending、无站点权限等）。',
        requestedJobIdsCount: jobNorm.ids.length,
        allowedJobIdsCount: 0,
        ...(jobNorm.truncated ? { constrainedJobIdsTruncated: true } : {}),
      })
    }

    const out = await runNextPendingJobs({
      origin,
      maxRuns,
      budgetMs,
      stopOnFailure,
      constrainedJobIds: allowedIds,
    })
    return Response.json({
      ...out,
      requestedJobIdsCount: jobNorm.ids.length,
      allowedJobIdsCount: allowedIds.length,
      ...(jobNorm.truncated ? { constrainedJobIdsTruncated: true } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('PAYLOAD_SECRET')) {
      return Response.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    throw e
  }
}
