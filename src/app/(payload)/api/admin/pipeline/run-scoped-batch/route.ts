import { normalizeConstrainedJobIds } from '@/utilities/workflowJobTickConstraints'

import { pipelineOrigin } from '@/app/api/pipeline/lib/internalPipelineFetch'
import { bootstrapWritingScopeIfIdle } from '@/utilities/bootstrapWritingScope'
import { runNextPendingJobsWithExpandedConstraints } from '@/utilities/pipelineRunNextExpanded'
import { requirePipelineRunNextAccess } from '@/utilities/pipelineRunNextAccess'
import {
  countWritingScopePending,
  listWritingScopePendingJobIds,
  resolveWritingScope,
} from '@/utilities/pipelineWritingScope'

export const dynamic = 'force-dynamic'

function parseOptionalPositiveInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return undefined
}

/**
 * POST — one batch of tick within writing pipeline scope (article and/or content brief).
 * Client should loop until `scopeDone` is true (see PipelineRunNextDrawer drain pattern).
 */
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

  const articleId = parseOptionalPositiveInt(body.articleId)
  const briefId = parseOptionalPositiveInt(body.briefId)

  const { payload, user } = g

  const resolved = await resolveWritingScope(payload, user, {
    articleId: articleId ?? null,
    briefId: briefId ?? null,
  })
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 400 })
  }

  const { articleId: scopeArticleId, briefId: scopeBriefId } = resolved.scope

  try {
    const origin = pipelineOrigin(request)

    const scopePendingCountBefore = await countWritingScopePending(
      payload,
      user,
      scopeArticleId,
      scopeBriefId,
    )

    const bootstrapOptOut = body.bootstrap === false

    let pendingSeedIds = await listWritingScopePendingJobIds(
      payload,
      user,
      scopeArticleId,
      scopeBriefId,
    )

    let bootstrapAttempted = false
    let bootstrapSummary: string[] = []

    if (pendingSeedIds.length === 0 && !bootstrapOptOut) {
      bootstrapAttempted = true
      const boot = await bootstrapWritingScopeIfIdle(payload, user, resolved.scope)
      if (boot.error) {
        return Response.json(
          {
            error: boot.error,
            bootstrapAttempted: true,
            ...(boot.summaries.length ? { bootstrapSummary: boot.summaries } : {}),
          },
          { status: 400 },
        )
      }
      bootstrapSummary = boot.summaries
      pendingSeedIds = await listWritingScopePendingJobIds(
        payload,
        user,
        scopeArticleId,
        scopeBriefId,
      )
    }

    if (pendingSeedIds.length === 0) {
      const scopePendingAfter = await countWritingScopePending(
        payload,
        user,
        scopeArticleId,
        scopeBriefId,
      )
      const bannerLines = [
        ...(debugBanner ?
          [
            bootstrapAttempted ?
              'run-scoped-batch: no pending after bootstrap'
            : 'run-scoped-batch: no pending seeds in writing scope',
          ]
        : []),
        ...(bootstrapSummary.length > 0 ? bootstrapSummary.map((s) => `bootstrap: ${s}`) : []),
      ]
      return Response.json({
        ok: true,
        totalRuns: 0,
        runs: [],
        stoppedReason: 'no_pending',
        scopeDone: true,
        scopePendingCountBefore,
        scopePendingCountAfter: scopePendingAfter,
        requestedArticleId: scopeArticleId,
        requestedBriefId: scopeBriefId,
        message:
          bootstrapAttempted ?
            'bootstrap 后仍无 pending（或无需新入队）。'
          : '作用域内没有处于 pending 的写作链路任务。',
        ...(bootstrapAttempted ? { bootstrapAttempted: true } : {}),
        ...(bootstrapSummary.length ? { bootstrapSummary } : {}),
        ...(bannerLines.length && debugBanner ? { bannerHints: bannerLines } : {}),
      })
    }

    const jobNorm = normalizeConstrainedJobIds(pendingSeedIds)
    if (!jobNorm.ok) {
      return Response.json({ error: jobNorm.error }, { status: 400 })
    }

    payload.logger.info(
      {
        scopeArticleId,
        scopeBriefId,
        scopePendingCountBefore,
        seedIdsCount: pendingSeedIds.length,
        maxRuns: maxRuns ?? 'default',
        budgetMs: budgetMs ?? 'default',
      },
      '[admin/pipeline/run-scoped-batch] start',
    )

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

    const scopePendingAfter = await countWritingScopePending(
      payload,
      user,
      scopeArticleId,
      scopeBriefId,
    )

    if (!out.ok) {
      payload.logger.warn(
        {
          stoppedReason: out.stoppedReason,
          failureSummary: out.failureSummary,
          totalRuns: out.totalRuns,
          scopeArticleId,
          scopeBriefId,
        },
        '[admin/pipeline/run-scoped-batch] finished with ok=false',
      )
    }

    return Response.json({
      ...out,
      scopeDone: scopePendingAfter === 0,
      scopePendingCountBefore,
      scopePendingCountAfter: scopePendingAfter,
      requestedArticleId: scopeArticleId,
      requestedBriefId: scopeBriefId,
      ...(bootstrapAttempted ? { bootstrapAttempted: true } : {}),
      ...(bootstrapSummary.length ? { bootstrapSummary } : {}),
    })
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
      '[admin/pipeline/run-scoped-batch] unhandled error',
    )
    return Response.json(
      {
        ok: false,
        error: 'run-scoped-batch 执行异常（见 errorDetail；服务端已记日志）',
        errorCode: 'run_scoped_batch_unhandled',
        errorDetail: msg.slice(0, 500),
        stoppedReason: 'failure',
        totalRuns: 0,
        runs: [],
      },
      { status: 500 },
    )
  }
}
