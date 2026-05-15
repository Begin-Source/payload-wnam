import type { Payload } from 'payload'

import { enqueueArticlePipelineCatchup } from '@/app/api/pipeline/lib/articlePipelineChain'
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

export type SiteDraftCatchupResult = {
  checked: number
  enqueued: number
  messages: string[]
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

function relationIdNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id)
    if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number(id.trim())
  }
  return null
}

export function articleBodyHasSectionPlaceholders(body: unknown): boolean {
  if (body == null) return false
  try {
    return JSON.stringify(body).includes('<!-- section:')
  } catch {
    return false
  }
}

export async function ensureDraftSectionCatchupForSite(
  payload: Payload,
  siteId: number,
): Promise<SiteDraftCatchupResult> {
  const articles = await payload.find({
    collection: 'articles',
    where: { site: { equals: siteId } },
    sort: 'createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  let checked = 0
  let enqueued = 0
  const messages: string[] = []

  for (const doc of articles.docs as Array<{
    id?: unknown
    sourceBrief?: unknown
    body?: unknown
  }>) {
    const articleId = relationIdNumber(doc.id)
    const sourceBriefId = relationIdNumber(doc.sourceBrief)
    if (articleId == null || sourceBriefId == null) continue
    if (!articleBodyHasSectionPlaceholders(doc.body)) continue

    checked += 1
    const result = await enqueueArticlePipelineCatchup(payload, articleId)
    if (!result.ok) {
      const errorMessage = 'error' in result ? result.error : 'unknown catchup error'
      messages.push(`article #${articleId}: ${errorMessage}`)
      continue
    }
    const created = result.messages.some((m) => m.includes('入队'))
    if (created) {
      enqueued += 1
      messages.push(`article #${articleId}: ${result.messages.join('；')}`)
    }
  }

  return { checked, enqueued, messages }
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
  /**
   * Queue consumers run the site workflow in short chunks. A chunk that hits
   * max_batches / budget with work remaining should keep the runner alive so
   * the queue can re-deliver the next chunk instead of marking it failed.
   */
  partialAsRunning?: boolean
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
    const catchupBefore = await ensureDraftSectionCatchupForSite(args.payload, input.siteId)
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

    const catchupAfter = await ensureDraftSectionCatchupForSite(args.payload, input.siteId)
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
        draftCatchup: {
          checked: catchupBefore.checked + catchupAfter.checked,
          enqueued: catchupBefore.enqueued + catchupAfter.enqueued,
          messages: [...catchupBefore.messages, ...catchupAfter.messages].slice(0, 20),
          before: catchupBefore,
          after: catchupAfter,
        },
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

  const canContinuePartial =
    args.partialAsRunning === true &&
    pendingRemaining > 0 &&
    !failureSummary &&
    (stoppedReason === 'max_batches' ||
      stoppedReason === 'budget' ||
      stoppedReason === 'max_runs')

  const ok = (pendingRemaining === 0 && !failureSummary) || canContinuePartial
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
    status: canContinuePartial ? 'running' : ok ? 'completed' : 'failed',
    completedAt: canContinuePartial ? null : new Date().toISOString(),
    output: result,
    errorMessage: ok ? '' : failureSummary || stoppedReason,
  })

  return result
}
