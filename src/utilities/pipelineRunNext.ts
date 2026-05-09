/**
 * Server-side loop: calls `/api/pipeline/tick?execute=1` with `x-internal-token`.
 * Does not expose secrets in return values.
 */

import { PIPELINE_BANNER_HINT_HEADER } from '@/utilities/pipelineBannerHints'

const BUDGET_BUFFER_MS = 2000
const MAX_RUNS_CAP = 20
const MIN_BUDGET_MS = 3000
const MAX_BUDGET_MS = 55000
/** Cap total hints merged into one run-next / run-scoped-batch response (screenshot UX). */
export const MAX_RUN_NEXT_BANNER_HINTS = 40

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
  /** From tick JSON when `x-pipeline-banner-hints: 1` */
  tickBannerHints?: string[]
}

export type RunNextResult = {
  ok: boolean
  totalRuns: number
  runs: RunNextSingleResult[]
  stoppedReason: RunNextStoppedReason
  /** 人类可读、脱敏摘要（供 Admin / 日志；无密钥） */
  failureSummary?: string
  /** Flattened tick `bannerHints` for Admin banner (capped). */
  bannerHints?: string[]
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)))
}

async function readTickResponseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  const t = text.trim()
  if (!t) return null
  try {
    return JSON.parse(t) as unknown
  } catch {
    return { _nonJsonBody: t.slice(0, 280) }
  }
}

/** Optional override for tests (`globalThis.fetch` stub). */
export type RunNextFetchImpl = typeof fetch

function tickBannerHintsFromParsed(parsed: Record<string, unknown> | null | undefined): string[] | undefined {
  if (!parsed || !Array.isArray(parsed.bannerHints)) return undefined
  const a = parsed.bannerHints.filter((x): x is string => typeof x === 'string')
  if (a.length === 0) return undefined
  return a
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 25)
}

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
  /** Adds `x-pipeline-banner-hints: 1` to tick requests; merges tick `bannerHints` into the result. */
  bannerHintsMode?: boolean
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

  const bannerHintsMode = args.bannerHintsMode === true

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
          ...(bannerHintsMode ? { [PIPELINE_BANNER_HINT_HEADER]: '1' } : {}),
        },
        body: JSON.stringify(tickBody),
        signal: args.signal,
      })
      httpStatus = res.status
      body = await readTickResponseBody(res)

      const durationMs = Math.max(0, nowFn() - t0)

      if (!res.ok) {
        let errMsg = `HTTP ${httpStatus}`
        let hintsFromErr: string[] | undefined
        if (body && typeof body === 'object' && body !== null) {
          const o = body as Record<string, unknown>
          hintsFromErr = tickBannerHintsFromParsed(o)
          if (typeof o._nonJsonBody === 'string' && o._nonJsonBody.trim()) {
            errMsg = `tick 返回非 JSON（${httpStatus}）：${o._nonJsonBody.trim()}`
          } else if (typeof o.error === 'string' && o.error.trim()) {
            errMsg = o.error.trim()
          }
        }
        runs.push({
          httpStatus,
          durationMs,
          errorMessage: errMsg.slice(0, 600),
          ...(hintsFromErr?.length ? { tickBannerHints: hintsFromErr } : {}),
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
        const hintsIdle = tickBannerHintsFromParsed(parsed ?? null)
        runs.push({
          httpStatus,
          durationMs,
          result: null,
          ...(typeof parsed?.message === 'string' ? { errorMessage: parsed.message } : {}),
          ...(hintsIdle?.length ? { tickBannerHints: hintsIdle } : {}),
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

      const tickHints = tickBannerHintsFromParsed(parsed ?? null)
      runs.push({
        jobId: jobId ?? null,
        jobType,
        result,
        httpStatus,
        durationMs,
        ...(errFromOutput != null ? { errorMessage: errFromOutput.slice(0, 500) } : {}),
        ...(tickHints?.length ? { tickBannerHints: tickHints } : {}),
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

  let failureSummary: string | undefined
  if (stoppedReason === 'failure' && runs.length > 0) {
    const last = runs[runs.length - 1]
    failureSummary = [
      `第 ${runs.length} 次 tick`,
      typeof last.jobType === 'string' && last.jobType ? `jobType=${last.jobType}` : '',
      last.jobId != null && last.jobId !== '' ? `jobId=${String(last.jobId)}` : '',
      typeof last.httpStatus === 'number' && last.httpStatus > 0 ? `http=${last.httpStatus}` : '',
      typeof last.durationMs === 'number' ? `${last.durationMs}ms` : '',
      last.errorMessage ? last.errorMessage.slice(0, 400) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const flatHints = runs.flatMap((r) => r.tickBannerHints ?? [])
  const bannerHints =
    flatHints.length > 0 ? flatHints.slice(0, MAX_RUN_NEXT_BANNER_HINTS) : undefined

  return {
    ok: stoppedReason !== 'failure' && stoppedReason !== 'aborted',
    totalRuns: runs.length,
    runs,
    stoppedReason,
    ...(failureSummary ? { failureSummary } : {}),
    ...(bannerHints?.length ? { bannerHints } : {}),
  }
}
