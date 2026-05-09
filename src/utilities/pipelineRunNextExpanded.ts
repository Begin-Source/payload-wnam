import type { Payload } from 'payload'

import { runNextPendingJobs, type RunNextResult } from '@/utilities/pipelineRunNext'
import type { Config } from '@/payload-types'
import {
  buildPendingConstrainedWhere,
  expandConstrainedWorkflowJobIdsForPipeline,
  MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
  type NormalizeConstrainedJobIdsResult,
} from '@/utilities/workflowJobTickConstraints'

export type RunNextExpandedExtras = {
  requestedJobIdsCount: number
  expandedConstrainedJobIdsCount: number
  allowedJobIdsCount: number
  pipelineSelectionChainExpanded?: boolean
  constrainedJobIdsTruncated?: boolean
  message?: string
}

export type RunNextExpandedResult = RunNextResult & RunNextExpandedExtras

/**
 * Expand seed job ids (for chain), take pending ∩ expanded, run tick loop (`runNextPendingJobs`).
 */
export async function runNextPendingJobsWithExpandedConstraints(args: {
  payload: Payload
  user: Config['user']
  origin: string
  jobNorm: Extract<NormalizeConstrainedJobIdsResult, { ok: true }>
  maxRuns?: number
  budgetMs?: number
  stopOnFailure?: boolean
  bannerHintsMode?: boolean
}): Promise<RunNextExpandedResult> {
  const { payload, user, origin, jobNorm, maxRuns, budgetMs, stopOnFailure, bannerHintsMode } = args

  const expanded = await expandConstrainedWorkflowJobIdsForPipeline(payload, user, jobNorm.ids)
  const idsTruncated = jobNorm.truncated || expanded.truncated

  const pendingRes = await payload.find({
    collection: 'workflow-jobs',
    where: buildPendingConstrainedWhere(expanded.ids),
    sort: 'createdAt',
    limit: MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
    depth: 0,
    overrideAccess: false,
    user,
  })

  const allowedIds = pendingRes.docs.map((d) => d.id)

  if (allowedIds.length === 0) {
    return {
      ok: true,
      totalRuns: 0,
      runs: [],
      stoppedReason: 'no_pending',
      message:
        '所选任务中没有处于 pending 状态，或不在当前账号可见范围内（可能非 pending、无站点权限等）。',
      requestedJobIdsCount: jobNorm.ids.length,
      expandedConstrainedJobIdsCount: expanded.ids.length,
      allowedJobIdsCount: 0,
      ...(expanded.ids.length > jobNorm.ids.length ? { pipelineSelectionChainExpanded: true } : {}),
      ...(idsTruncated ? { constrainedJobIdsTruncated: true } : {}),
    }
  }

  const out = await runNextPendingJobs({
    origin,
    maxRuns,
    budgetMs,
    stopOnFailure,
    constrainedJobIds: allowedIds,
    bannerHintsMode,
  })

  return {
    ...out,
    requestedJobIdsCount: jobNorm.ids.length,
    expandedConstrainedJobIdsCount: expanded.ids.length,
    allowedJobIdsCount: allowedIds.length,
    ...(expanded.ids.length > jobNorm.ids.length ? { pipelineSelectionChainExpanded: true } : {}),
    ...(idsTruncated ? { constrainedJobIdsTruncated: true } : {}),
  }
}
