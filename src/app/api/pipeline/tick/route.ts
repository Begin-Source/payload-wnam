import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  enqueueDraftFinalizeIfSectionsDone,
  enqueueDraftSectionsAfterSkeleton,
  enqueueImageGenerateIfNeeded,
  enqueueMoreDraftSectionsAfterCompletion,
  markArticlePublishReady,
  resolveTogetherImageEnabledForArticleJob,
} from '@/app/api/pipeline/lib/articlePipelineChain'
import { enqueueDraftSkeletonAfterBriefGenerate } from '@/app/api/pipeline/lib/enqueueDraftSkeletonAfterBrief'
import { enqueueHandoffFollowUp } from '@/app/api/pipeline/lib/enqueueHandoffFollowUp'
import {
  articleIdFromJob,
  briefIdFromJob,
  dispatchWorkflowJob,
  interpretJobResponse,
  siteIdFromJob,
  type WorkflowJobDoc,
} from '@/app/api/pipeline/lib/workflowJobRunner'
import {
  buildPendingConstrainedWhere,
  normalizeConstrainedJobIds,
  parseConstrainedIdsFromCommaQuery,
} from '@/utilities/workflowJobTickConstraints'
import { pushPipelineBannerHint, wantsPipelineBannerHints } from '@/utilities/pipelineBannerHints'
import { runWithSqliteBusyRetry } from '@/utilities/sqliteBusyRetry'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/tick'

function tickAuth(request: Request) {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  return null
}

async function peekPendingCore(
  constrainedIds: (string | number)[],
  opts?: { constrainedJobIdsTruncated?: boolean },
): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const jobs = await payload.find({
    collection: 'workflow-jobs',
    where: buildPendingConstrainedWhere(constrainedIds),
    limit: 1,
    sort: 'createdAt',
    depth: 0,
  })
  const doc = jobs.docs[0] as { id: string | number; jobType?: string } | undefined
  if (!doc) {
    return Response.json({
      ok: true,
      pending: 0,
      cronDispatch: '/api/pipeline/cron-dispatch',
      executeHint: 'POST with body {"execute":true} or ?execute=1 to run one pending job.',
      hint: 'Schedule HTTP POST to cron-dispatch (preset daily_lifecycle / weekly_link_audits); Worker crons need a scheduled handler or external curl.',
      ...(opts?.constrainedJobIdsTruncated ? { constrainedJobIdsTruncated: true } : {}),
    })
  }
  return Response.json({
    ok: true,
    nextJobId: doc.id,
    jobType: doc.jobType,
    cronDispatch: '/api/pipeline/cron-dispatch',
    executeHint: 'POST with body {"execute":true} or ?execute=1 to run one pending job.',
    ...(opts?.constrainedJobIdsTruncated ? { constrainedJobIdsTruncated: true } : {}),
  })
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = tickAuth(request)
  if (unauthorized) return unauthorized
  const parsed = parseConstrainedIdsFromCommaQuery(new URL(request.url).searchParams.get('ids'))
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  return peekPendingCore(parsed.ids, {
    constrainedJobIdsTruncated: parsed.truncated,
  })
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = tickAuth(request)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const body = (await request.json().catch(() => ({}))) as {
    execute?: boolean
    constrainedJobIds?: unknown
  }
  const normalized = normalizeConstrainedJobIds(body.constrainedJobIds)
  if (!normalized.ok) {
    return Response.json({ error: normalized.error }, { status: 400 })
  }
  const constrainedIds = normalized.ids

  const execute = body.execute === true || url.searchParams.get('execute') === '1'
  const collectHints = wantsPipelineBannerHints(request)

  if (!execute) {
    return peekPendingCore(constrainedIds, {
      constrainedJobIdsTruncated: normalized.truncated,
    })
  }

  const payload = await getPayload({ config: configPromise })
  const jobs = await payload.find({
    collection: 'workflow-jobs',
    where: buildPendingConstrainedWhere(constrainedIds),
    limit: 1,
    sort: 'createdAt',
    depth: 1,
  })
  const doc = jobs.docs[0] as WorkflowJobDoc | undefined
  if (!doc) {
    return Response.json({
      ok: true,
      executed: false,
      pending: 0,
      message: 'No pending jobs',
      cronDispatch: '/api/pipeline/cron-dispatch',
      ...(normalized.truncated ? { constrainedJobIdsTruncated: true } : {}),
      ...(collectHints ? { bannerHints: ['tick: no pending job in constraint set'] } : {}),
    })
  }

  const jobId = doc.id
  await payload.update({
    collection: 'workflow-jobs',
    id: jobId,
    data: {
      status: 'running',
      startedAt: new Date().toISOString(),
      errorMessage: '',
    },
  })

  const pipelineBannerHints: string[] = []
  const hint = (line: string) => {
    if (!collectHints) return
    pushPipelineBannerHint(pipelineBannerHints, line)
  }

  try {
    if (doc.jobType === 'image_generate') {
      const togetherOn = await resolveTogetherImageEnabledForArticleJob(payload, doc)
      if (!togetherOn) {
        const skippedOutput: Record<string, unknown> = {
          ok: true,
          skipped: true,
          reason: 'together_image_disabled',
        }
        await payload.update({
          collection: 'workflow-jobs',
          id: jobId,
          data: {
            status: 'completed',
            completedAt: new Date().toISOString(),
            output: skippedOutput,
            errorMessage: '',
          },
        })
        try {
          await enqueueHandoffFollowUp(payload, {
            completedJob: {
              id: jobId,
              site: doc.site,
              article: doc.article,
              handoff: (doc as { handoff?: unknown }).handoff,
            },
            output: skippedOutput,
          })
        } catch {
          // follow-up enqueue is best-effort
        }

        const fromInput =
          typeof doc.input === 'object' && doc.input && !Array.isArray(doc.input)
            ? ((doc.input as { articleId?: unknown }).articleId as number | string | undefined)
            : undefined
        const fromInputNum =
          typeof fromInput === 'number' && Number.isFinite(fromInput)
            ? fromInput
            : typeof fromInput === 'string' && /^\d+$/.test(fromInput)
              ? Number(fromInput)
              : null
        const rel = articleIdFromJob(doc)
        const relNum = rel != null && /^\d+$/.test(rel) ? Number(rel) : null
        const oid = fromInputNum ?? relNum
        if (typeof oid === 'number' && Number.isFinite(oid)) {
          try {
            await runWithSqliteBusyRetry(
              () => markArticlePublishReady(payload, oid),
              { logger: payload.logger, label: `${PATH} markArticlePublishReady skipped image` },
            )
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            const stack = e instanceof Error ? e.stack : undefined
            payload.logger.error(
              {
                err: msg,
                stack: typeof stack === 'string' ? stack.slice(0, 2500) : undefined,
                jobId,
                jobType: doc.jobType,
                chainStep: 'markArticlePublishReady skipped image',
              },
              '[pipeline/tick] chained pipeline enqueue failed',
            )
          }
        }

        hint(`tick done jobType=image_generate result=skipped reason=together_image_disabled jobId=${String(jobId)}`)
        return Response.json({
          ok: true,
          executed: true,
          jobId,
          jobType: doc.jobType,
          result: 'completed',
          httpStatus: 200,
          output: skippedOutput,
          ...(collectHints && pipelineBannerHints.length > 0 ? { bannerHints: pipelineBannerHints } : {}),
        })
      }
    }

    const inner = await dispatchWorkflowJob(request, doc, payload)
    const { success, body: output, httpStatus } = await interpretJobResponse(inner)

    if (!success) {
      const errMsg =
        output &&
        typeof output === 'object' &&
        'error' in output &&
        typeof (output as { error: unknown }).error === 'string'
          ? (output as { error: string }).error
          : `HTTP ${httpStatus}`
      const outputDoc =
        output !== null && typeof output === 'object' && !Array.isArray(output)
          ? (output as Record<string, unknown>)
          : { result: output }

      await payload.update({
        collection: 'workflow-jobs',
        id: jobId,
        data: {
          status: 'failed',
          completedAt: new Date().toISOString(),
          output: outputDoc,
          errorMessage: errMsg,
        },
      })
      const errShort = errMsg.replace(/\s+/g, ' ').trim().slice(0, 72)
      hint(
        `tick jobType=${doc.jobType ?? '?'} result=failed jobId=${String(jobId)} http=${httpStatus}${errShort ? ` err=${errShort}` : ''}`,
      )
      return Response.json({
        ok: true,
        executed: true,
        jobId,
        jobType: doc.jobType,
        result: 'failed',
        httpStatus,
        output,
        ...(collectHints && pipelineBannerHints.length > 0 ? { bannerHints: pipelineBannerHints } : {}),
      })
    }

    const outputDoc =
      output !== null && typeof output === 'object' && !Array.isArray(output)
        ? (output as Record<string, unknown>)
        : { result: output }

    const handoffOut =
      outputDoc && typeof outputDoc === 'object' && 'handoff' in outputDoc ? outputDoc.handoff : undefined

    await payload.update({
      collection: 'workflow-jobs',
      id: jobId,
      data: {
        status: 'completed',
        completedAt: new Date().toISOString(),
        output: outputDoc,
        errorMessage: '',
        ...(handoffOut !== undefined && handoffOut !== null
          ? { handoff: handoffOut as Record<string, unknown> }
          : {}),
      },
    })
    try {
      await enqueueHandoffFollowUp(payload, {
        completedJob: {
          id: jobId,
          site: doc.site,
          article: doc.article,
          handoff: handoffOut ?? (doc as { handoff?: unknown }).handoff,
        },
        output: outputDoc,
      })
    } catch {
      // follow-up enqueue is best-effort
    }
    if (doc.jobType === 'brief_generate') {
      const bid = outputDoc.id
      if (bid != null) {
        const s = doc.site
        const siteNum =
          typeof s === 'number' && Number.isFinite(s)
            ? s
            : typeof s === 'object' && s !== null && 'id' in s
              ? Number((s as { id: unknown }).id)
              : null
        const siteNumeric = siteNum != null && Number.isFinite(siteNum) ? siteNum : null
        try {
          await runWithSqliteBusyRetry(
            () =>
              enqueueDraftSkeletonAfterBriefGenerate(payload, {
                completedBriefJobId: jobId,
                briefId: typeof bid === 'string' || typeof bid === 'number' ? bid : String(bid),
                siteNumeric,
              }),
            { logger: payload.logger, label: `${PATH} enqueueDraftSkeletonAfterBriefGenerate` },
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const stack = e instanceof Error ? e.stack : undefined
          payload.logger.error(
            {
              err: msg,
              stack: typeof stack === 'string' ? stack.slice(0, 2500) : undefined,
              jobId,
              jobType: doc.jobType,
              chainStep: 'enqueueDraftSkeletonAfterBriefGenerate',
            },
            '[pipeline/tick] brief_generate chain enqueue failed',
          )
        }
      }
    }

    const runChainedEnqueue = async <T>(
      label: string,
      fn: () => Promise<T>,
    ): Promise<{ ok: true; result: T } | { ok: false }> => {
      try {
        const result = await runWithSqliteBusyRetry(fn, {
          logger: payload.logger,
          label: `${PATH} ${label}`,
        })
        return { ok: true, result }
      } catch (chainErr) {
        const msg = chainErr instanceof Error ? chainErr.message : String(chainErr)
        const stack = chainErr instanceof Error ? chainErr.stack : undefined
        payload.logger.error(
          {
            err: msg,
            stack: typeof stack === 'string' ? stack.slice(0, 2500) : undefined,
            jobId,
            jobType: doc.jobType,
            chainStep: label,
          },
          '[pipeline/tick] chained pipeline enqueue failed',
        )
        return { ok: false }
      }
    }

    if (doc.jobType === 'draft_skeleton') {
      const oid = outputDoc.articleId ?? outputDoc.id
      const briefKey = briefIdFromJob(doc)
      const s = doc.site
      const siteNum =
        typeof s === 'number' && Number.isFinite(s)
          ? s
          : typeof s === 'object' && s !== null && 'id' in s
            ? Number((s as { id: unknown }).id)
            : null
      const siteParsed = siteIdFromJob(doc)
      const siteNumeric =
        siteNum != null && Number.isFinite(siteNum)
          ? siteNum
          : siteParsed && /^\d+$/.test(siteParsed)
            ? Number(siteParsed)
            : null
      const briefForChain =
        briefKey != null ? briefKey : (doc.input as { briefId?: unknown } | undefined)?.briefId ?? null

      payload.logger.info(
        {
          jobId,
          articleIdFromOutput: oid,
          briefForChain,
          siteNumeric,
          outputHasArticleId: typeof outputDoc.articleId === 'number',
        },
        '[pipeline/tick] draft_skeleton chain: enqueueDraftSectionsAfterSkeleton input',
      )

      hint(
        `draft_skeleton pre articleId=${String(oid ?? '')} briefId=${String(briefForChain ?? '')} outNumArticleId=${typeof outputDoc.articleId === 'number'}`,
      )

      const chainSk = await runChainedEnqueue('enqueueDraftSectionsAfterSkeleton', () =>
        enqueueDraftSectionsAfterSkeleton(payload, {
          completedSkeletonJobId: jobId,
          articleId: oid,
          briefId: briefForChain,
          siteNumeric,
        }),
      )
      if (chainSk.ok) {
        const n =
          typeof chainSk.result === 'number' && Number.isFinite(chainSk.result) ? chainSk.result : 0
        hint(`draft_skeleton sectionsEnqueued=${n}`)
        payload.logger.info(
          {
            jobId,
            jobType: 'draft_skeleton',
            articleId: oid,
            briefId: briefForChain,
          },
          '[pipeline/tick] draft_skeleton chain: enqueueDraftSectionsAfterSkeleton completed (check workflow-jobs for draft_section)',
        )
      } else {
        hint('draft_skeleton enqueue chain failed (see server chained pipeline log)')
      }
    }
    if (doc.jobType === 'draft_section') {
      await runChainedEnqueue('enqueueMoreDraftSectionsAfterCompletion', () =>
        enqueueMoreDraftSectionsAfterCompletion(payload, doc),
      )
      await runChainedEnqueue('enqueueDraftFinalizeIfSectionsDone', () =>
        enqueueDraftFinalizeIfSectionsDone(payload, doc),
      )
    }
    if (doc.jobType === 'draft_finalize') {
      await runChainedEnqueue('enqueueImageGenerateIfNeeded', () => enqueueImageGenerateIfNeeded(payload, doc))
    }
    if (doc.jobType === 'image_generate' && outputDoc.ok === true) {
      const fromOut = outputDoc.articleId
      const fromOutNum =
        typeof fromOut === 'number' && Number.isFinite(fromOut)
          ? fromOut
          : typeof fromOut === 'string' && /^\d+$/.test(fromOut)
            ? Number(fromOut)
            : null
      const fromInput =
        typeof doc.input === 'object' && doc.input && !Array.isArray(doc.input)
          ? ((doc.input as { articleId?: unknown }).articleId as number | string | undefined)
          : undefined
      const fromInputNum =
        typeof fromInput === 'number' && Number.isFinite(fromInput)
          ? fromInput
          : typeof fromInput === 'string' && /^\d+$/.test(fromInput)
            ? Number(fromInput)
            : null
      const rel = articleIdFromJob(doc)
      const relNum = rel != null && /^\d+$/.test(rel) ? Number(rel) : null
      const oid = fromOutNum ?? fromInputNum ?? relNum
      if (typeof oid === 'number' && Number.isFinite(oid)) {
        await runChainedEnqueue('markArticlePublishReady', () => markArticlePublishReady(payload, oid))
      }
    }
    hint(`tick done jobType=${doc.jobType ?? '?'} result=completed jobId=${String(jobId)}`)
    return Response.json({
      ok: true,
      executed: true,
      jobId,
      jobType: doc.jobType,
      result: 'completed',
      httpStatus,
      output,
      ...(collectHints && pipelineBannerHints.length > 0 ? { bannerHints: pipelineBannerHints } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await payload.update({
      collection: 'workflow-jobs',
      id: jobId,
      data: {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: msg,
      },
    })
    const errHints = collectHints ? [`tick exception jobId=${String(jobId)}: ${msg.slice(0, 160)}`] : []
    return Response.json({
      ok: true,
      executed: true,
      jobId,
      jobType: doc.jobType,
      result: 'failed',
      error: msg,
      ...(errHints.length > 0 ? { bannerHints: errHints } : {}),
    })
  }
}
