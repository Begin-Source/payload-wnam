import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  enqueueDraftFinalizeIfSectionsDone,
  enqueueDraftSectionsAfterSkeleton,
  enqueueImageGenerateIfNeeded,
  enqueueMoreDraftSectionsAfterCompletion,
  markArticlePublishReady,
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

  try {
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
      return Response.json({
        ok: true,
        executed: true,
        jobId,
        jobType: doc.jobType,
        result: 'failed',
        httpStatus,
        output,
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
          await enqueueDraftSkeletonAfterBriefGenerate(payload, {
            completedBriefJobId: jobId,
            briefId: typeof bid === 'string' || typeof bid === 'number' ? bid : String(bid),
            siteNumeric,
          })
        } catch {
          // chain enqueue is best-effort
        }
      }
    }

    try {
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
        await enqueueDraftSectionsAfterSkeleton(payload, {
          completedSkeletonJobId: jobId,
          articleId: oid,
          briefId:
            briefKey != null ? briefKey : (doc.input as { briefId?: unknown } | undefined)?.briefId ?? null,
          siteNumeric,
        })
      }
      if (doc.jobType === 'draft_section') {
        await enqueueMoreDraftSectionsAfterCompletion(payload, doc)
        await enqueueDraftFinalizeIfSectionsDone(payload, doc)
      }
      if (doc.jobType === 'draft_finalize') {
        await enqueueImageGenerateIfNeeded(payload, doc)
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
          await markArticlePublishReady(payload, oid)
        }
      }
    } catch {
      /* chained pipeline enqueue ignored */
    }
    return Response.json({
      ok: true,
      executed: true,
      jobId,
      jobType: doc.jobType,
      result: 'completed',
      httpStatus,
      output,
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
    return Response.json({
      ok: true,
      executed: true,
      jobId,
      jobType: doc.jobType,
      result: 'failed',
      error: msg,
    })
  }
}
