import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { pipelineOrigin } from '@/app/api/pipeline/lib/internalPipelineFetch'
import { runNextPendingJobs } from '@/utilities/pipelineRunNext'
import { requirePipelineRunNextAccess } from '@/utilities/pipelineRunNextAccess'
import { runNextPendingJobsWithExpandedConstraints } from '@/utilities/pipelineRunNextExpanded'
import {
  buildPendingConstrainedWhere,
  expandConstrainedWorkflowJobIdsForPipeline,
  MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
  normalizeConstrainedJobIds,
  parseConstrainedIdsFromCommaQuery,
} from '@/utilities/workflowJobTickConstraints'

export const dynamic = 'force-dynamic'

/**
 * Staff (any role beyond plain `user`) bridge to run `/api/pipeline/tick` in a loop.
 * Responses never echo `PAYLOAD_SECRET`.
 */

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

  const expanded = await expandConstrainedWorkflowJobIdsForPipeline(payload, user, parsed.ids)
  const idsTruncated = parsed.truncated || expanded.truncated

  const pendingRes = await payload.find({
    collection: 'workflow-jobs',
    where: buildPendingConstrainedWhere(expanded.ids),
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
    expandedConstrainedJobIdsCount: expanded.ids.length,
    ...(expanded.ids.length > parsed.ids.length ? { pipelineSelectionChainExpanded: true } : {}),
    ...(idsTruncated ? { constrainedJobIdsTruncated: true } : {}),
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

  const debugBanner = body.debugBanner === true

  const jobNorm = normalizeConstrainedJobIds(body.jobIds)
  if (!jobNorm.ok) {
    return Response.json({ error: jobNorm.error }, { status: 400 })
  }

  const { payload, user } = g

  try {
    const origin = pipelineOrigin(request)

    payload.logger.info(
      {
        maxRuns: maxRuns ?? 'default',
        budgetMs: budgetMs ?? 'default',
        stopOnFailure,
        constrainedIdsCount: jobNorm.ids.length,
      },
      '[admin/pipeline/run-next] start',
    )

    if (jobNorm.ids.length === 0) {
      const out = await runNextPendingJobs({
        origin,
        maxRuns,
        budgetMs,
        stopOnFailure,
        bannerHintsMode: debugBanner,
      })
      if (!out.ok) {
        payload.logger.warn(
          {
            stoppedReason: out.stoppedReason,
            failureSummary: out.failureSummary,
            totalRuns: out.totalRuns,
          },
          '[admin/pipeline/run-next] finished with ok=false',
        )
      }
      return Response.json(out)
    }

    const out = await runNextPendingJobsWithExpandedConstraints({
      payload,
      user,
      origin,
      jobNorm,
      maxRuns,
      budgetMs,
      stopOnFailure,
      bannerHintsMode: debugBanner,
    })
    if (!out.ok) {
      payload.logger.warn(
        {
          stoppedReason: out.stoppedReason,
          failureSummary: out.failureSummary,
          totalRuns: out.totalRuns,
        },
        '[admin/pipeline/run-next] finished with ok=false',
      )
    }
    return Response.json(out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : undefined
    if (msg.includes('PAYLOAD_SECRET')) {
      return Response.json(
        { error: 'Server misconfigured', errorCode: 'misconfigured' },
        { status: 500 },
      )
    }
    payload.logger.error(
      { err: msg, stack: typeof stack === 'string' ? stack.slice(0, 2500) : undefined },
      '[admin/pipeline/run-next] unhandled error',
    )
    return Response.json(
      {
        ok: false,
        error: 'Pipeline run-next 执行异常（见 errorDetail；服务端已记日志）',
        errorCode: 'run_next_unhandled',
        errorDetail: msg.slice(0, 500),
        stoppedReason: 'failure',
        totalRuns: 0,
        runs: [],
      },
      { status: 500 },
    )
  }
}
