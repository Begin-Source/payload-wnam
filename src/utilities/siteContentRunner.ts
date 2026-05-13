import type { Payload } from 'payload'

import { runNextPendingJobs, type RunNextFetchImpl } from '@/utilities/pipelineRunNext'

export const SITE_CONTENT_RUNNER_JOB_TYPE = 'site_content_runner'

export type SiteContentRunnerInput = {
  siteId: number
  batchMaxRuns?: number
  batchBudgetMs?: number
  maxBatches?: number
  stopOnFailure?: boolean
}

export type SiteContentRunnerResult = {
  ok: boolean
  siteId: number
  batches: number
  totalTicks: number
  stoppedReason: string
  pendingRemaining: number
  failureSummary?: string
}

const DEFAULT_BATCH_MAX_RUNS = 20
const DEFAULT_BATCH_BUDGET_MS = 55_000
const DEFAULT_MAX_BATCHES = 80

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function normalizeRunnerInput(raw: SiteContentRunnerInput): Required<SiteContentRunnerInput> {
  return {
    siteId: Math.floor(raw.siteId),
    batchMaxRuns: clampInt(raw.batchMaxRuns, DEFAULT_BATCH_MAX_RUNS, 1, 20),
    batchBudgetMs: clampInt(raw.batchBudgetMs, DEFAULT_BATCH_BUDGET_MS, 3_000, 55_000),
    maxBatches: clampInt(raw.maxBatches, DEFAULT_MAX_BATCHES, 1, 500),
    stopOnFailure: raw.stopOnFailure !== false,
  }
}

export async function listPendingWorkflowJobIdsForSite(
  payload: Payload,
  siteId: number,
): Promise<(string | number)[]> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { site: { equals: siteId } },
        { status: { equals: 'pending' } },
        { jobType: { not_equals: SITE_CONTENT_RUNNER_JOB_TYPE } },
      ],
    },
    limit: 500,
    sort: 'createdAt',
    depth: 0,
    overrideAccess: true,
  })
  const ids: (string | number)[] = []
  for (const doc of r.docs) {
    const id = (doc as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') ids.push(id)
  }
  return ids
}

async function patchRunnerJob(
  payload: Payload,
  runnerJobId: string | number | null | undefined,
  data: Record<string, unknown>,
): Promise<void> {
  if (runnerJobId == null) return
  try {
    await payload.update({
      collection: 'workflow-jobs',
      id: runnerJobId,
      data,
      overrideAccess: true,
    })
  } catch {
    /* best-effort progress update */
  }
}

export async function runSiteContentRunner(args: {
  payload: Payload
  origin: string
  input: SiteContentRunnerInput
  runnerJobId?: string | number | null
  fetchImpl?: RunNextFetchImpl
}): Promise<SiteContentRunnerResult> {
  const input = normalizeRunnerInput(args.input)

  await patchRunnerJob(args.payload, args.runnerJobId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    errorMessage: '',
    output: {
      ok: true,
      state: 'running',
      siteId: input.siteId,
      batches: 0,
      totalTicks: 0,
      pendingRemaining: null,
    },
  })

  let batches = 0
  let totalTicks = 0
  let stoppedReason = 'not_started'
  let pendingRemaining = 0
  let failureSummary: string | undefined
  let noProgressRounds = 0

  for (let round = 0; round < input.maxBatches; round += 1) {
    const pendingIds = await listPendingWorkflowJobIdsForSite(args.payload, input.siteId)
    pendingRemaining = pendingIds.length
    if (pendingIds.length === 0) {
      stoppedReason = 'no_pending'
      break
    }

    const before = pendingIds.length
    const out = await runNextPendingJobs({
      origin: args.origin,
      maxRuns: input.batchMaxRuns,
      budgetMs: input.batchBudgetMs,
      stopOnFailure: input.stopOnFailure,
      constrainedJobIds: pendingIds,
      bannerHintsMode: true,
      ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
    })

    batches += 1
    totalTicks += out.totalRuns
    stoppedReason = out.stoppedReason
    failureSummary = out.failureSummary

    const pendingAfter = await listPendingWorkflowJobIdsForSite(args.payload, input.siteId)
    pendingRemaining = pendingAfter.length

    await patchRunnerJob(args.payload, args.runnerJobId, {
      output: {
        ok: out.ok,
        state: 'running',
        siteId: input.siteId,
        batches,
        totalTicks,
        lastStoppedReason: out.stoppedReason,
        pendingBefore: before,
        pendingRemaining,
        lastFailureSummary: out.failureSummary,
        lastBannerHints: out.bannerHints?.slice(0, 12) ?? [],
      },
    })

    if (!out.ok || out.stoppedReason === 'failure' || out.stoppedReason === 'aborted') {
      stoppedReason = out.stoppedReason
      break
    }

    if (pendingAfter.length === 0) {
      stoppedReason = 'no_pending'
      break
    }

    if (out.totalRuns === 0) {
      noProgressRounds += 1
    } else {
      noProgressRounds = 0
    }
    if (noProgressRounds >= 3) {
      stoppedReason = 'no_progress'
      failureSummary = '连续 3 轮没有减少 pending 任务，已停止以避免死循环'
      break
    }
  }

  if (batches >= input.maxBatches && pendingRemaining > 0 && stoppedReason !== 'failure') {
    stoppedReason = 'max_batches'
  }

  const ok = pendingRemaining === 0 && !failureSummary
  const result: SiteContentRunnerResult = {
    ok,
    siteId: input.siteId,
    batches,
    totalTicks,
    stoppedReason,
    pendingRemaining,
    ...(failureSummary ? { failureSummary } : {}),
  }

  await patchRunnerJob(args.payload, args.runnerJobId, {
    status: ok ? 'completed' : 'failed',
    completedAt: new Date().toISOString(),
    output: result,
    errorMessage: ok ? '' : failureSummary || stoppedReason,
  })

  return result
}
