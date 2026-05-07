/**
 * Server-side loop: calls `/api/pipeline/tick?execute=1` with `x-internal-token`.
 * Does not expose secrets in return values.
 */

const BUDGET_BUFFER_MS = 2000
const MAX_RUNS_CAP = 20
const MIN_BUDGET_MS = 3000
const MAX_BUDGET_MS = 55000

export type RunNextStoppedReason =
  | 'no_pending'
  | 'budget'
  | 'max_runs'
  | 'failure'
  | 'aborted'

export type RunNextSingleResult = {
  jobId?: string | number | null
  jobType?: string | null
  result?: string | null
  httpStatus: number
  durationMs: number
  errorMessage?: string
}

export type RunNextResult = {
  ok: boolean
  totalRuns: number
  runs: RunNextSingleResult[]
  stoppedReason: RunNextStoppedReason
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** Optional override for tests (`globalThis.fetch` stub). */
export type RunNextFetchImpl = typeof fetch

export async function runNextPendingJobs(args: {
  origin: string
  maxRuns?: number
  budgetMs?: number
  stopOnFailure?: boolean
  signal?: AbortSignal
  fetchImpl?: RunNextFetchImpl
  /** Test hook: monotonic clock (defaults to `Date.now`). */
  getNow?: () => number
  /** If set, each tick picks the oldest pending job among these ids only. */
  constrainedJobIds?: (string | number)[]
}): Promise<RunNextResult> {
  const nowFn = args.getNow ?? (() => Date.now())
  const secret = process.env.PAYLOAD_SECRET?.trim()
  if (!secret) {
    throw new Error('PAYLOAD_SECRET not configured')
  }

  const stopOnFailure = args.stopOnFailure !== false
  const fetchFn = args.fetchImpl ?? fetch

  const effectiveMaxRuns = clampInt(
    args.maxRuns == null || !Number.isFinite(args.maxRuns) ? 5 : args.maxRuns,
    1,
    MAX_RUNS_CAP,
  )

  const rawBudget =
    args.budgetMs == null || !Number.isFinite(args.budgetMs) ? 25000 : args.budgetMs
  const effectiveBudgetMs = clampInt(rawBudget, MIN_BUDGET_MS, MAX_BUDGET_MS)

  const base = args.origin.replace(/\/$/, '')
  const url = `${base}/api/pipeline/tick?execute=1`

  const tickBody =
    args.constrainedJobIds != null && args.constrainedJobIds.length > 0
      ? { execute: true as const, constrainedJobIds: args.constrainedJobIds }
      : { execute: true as const }

  const runs: RunNextSingleResult[] = []
  const start = nowFn()
  const deadline = start + effectiveBudgetMs - BUDGET_BUFFER_MS

  let stoppedReason: RunNextStoppedReason = 'max_runs'

  for (let i = 0; i < effectiveMaxRuns; i++) {
    if (args.signal?.aborted) {
      stoppedReason = 'aborted'
      break
    }
    if (nowFn() >= deadline) {
      stoppedReason = runs.length > 0 ? 'budget' : 'budget'
      break
    }

    const t0 = nowFn()
    let httpStatus = 0
    let body: unknown

    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': secret,
        },
        body: JSON.stringify(tickBody),
        signal: args.signal,
      })
      httpStatus = res.status
      body = await res.json().catch(() => null)

      const durationMs = Math.max(0, nowFn() - t0)

      if (!res.ok) {
        const errMsg =
          body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `HTTP ${httpStatus}`
        runs.push({
          httpStatus,
          durationMs,
          errorMessage: errMsg,
        })
        if (stopOnFailure) {
          stoppedReason = 'failure'
          break
        }
        continue
      }

      const parsed = body as Record<string, unknown> | null
      const executed = parsed?.executed === true

      if (!executed) {
        stoppedReason = 'no_pending'
        runs.push({
          httpStatus,
          durationMs,
          result: null,
          ...(typeof parsed?.message === 'string' ? { errorMessage: parsed.message } : {}),
        })
        break
      }

      const jobId = parsed?.jobId as string | number | undefined
      const jobType = typeof parsed?.jobType === 'string' ? parsed.jobType : null
      const result = typeof parsed?.result === 'string' ? parsed.result : null

      const errFromOutput =
        result === 'failed' &&
        parsed?.output &&
        typeof parsed.output === 'object' &&
        !Array.isArray(parsed.output) &&
        'error' in (parsed.output as object) &&
        typeof (parsed.output as { error: unknown }).error === 'string'
          ? (parsed.output as { error: string }).error
          : undefined

      runs.push({
        jobId: jobId ?? null,
        jobType,
        result,
        httpStatus,
        durationMs,
        ...(errFromOutput != null ? { errorMessage: errFromOutput.slice(0, 500) } : {}),
      })

      if (result === 'failed' && stopOnFailure) {
        stoppedReason = 'failure'
        break
      }

      if (i === effectiveMaxRuns - 1) {
        stoppedReason = 'max_runs'
      }
    } catch (e) {
      const durationMs = Math.max(0, nowFn() - t0)
      if (args.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) {
        stoppedReason = 'aborted'
        runs.push({
          httpStatus,
          durationMs,
          errorMessage: 'aborted',
        })
        break
      }
      runs.push({
        httpStatus,
        durationMs,
        errorMessage: e instanceof Error ? e.message : String(e),
      })
      if (stopOnFailure) {
        stoppedReason = 'failure'
        break
      }
    }
  }

  return {
    ok: stoppedReason !== 'failure' && stoppedReason !== 'aborted',
    totalRuns: runs.length,
    runs,
    stoppedReason,
  }
}
