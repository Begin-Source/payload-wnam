import { runnerRecoveryWhere } from '@/utilities/workflowRecoveryWhere'
import { claimWorkflowJob, patchLeasedWorkflowJob, releaseWorkflowLease, recoverExpiredWorkflowJobs } from '@/utilities/workflowJobLease'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  CONTENT_WORKFLOW_MESSAGE_SITE_RUNNER,
  enqueueContentWorkflowMessage,
  getContentWorkflowQueueFromOpenNext,
  type ContentWorkflowQueueMessage,
} from '@/utilities/contentWorkflowQueue'
import { type SiteContentRunnerInput } from '@/utilities/siteContentRunner'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/content-workflow/kick'

function numberFromBody(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function relationIdNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  if (raw && typeof raw === 'object' && 'id' in raw) {
    return relationIdNumber((raw as { id?: unknown }).id)
  }
  return null
}

function inputFromUnknown(raw: unknown, siteId: number): SiteContentRunnerInput {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    siteId,
    batchMaxRuns: numberFromBody(input.batchMaxRuns, 10, 1, 20),
    batchBudgetMs: numberFromBody(input.batchBudgetMs, 50_000, 3_000, 55_000),
    maxBatches: Math.min(numberFromBody(input.maxBatches, 3, 1, 80), 3),
    stopOnFailure: input.stopOnFailure !== false,
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(auth)) return auth.response

  const queue = getContentWorkflowQueueFromOpenNext()
  if (!queue) {
    return Response.json({ ok: false, error: 'CONTENT_WORKFLOW_QUEUE not bound' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const limit = numberFromBody(body.limit, 25, 1, 100)
  const payload = await getPayload({ config: configPromise })
  const recoveredJobs = await recoverExpiredWorkflowJobs(payload)
  const jobs = await payload.find({
    collection: 'workflow-jobs',
    where: runnerRecoveryWhere(),
    limit,
    sort: 'updatedAt',
    depth: 0,
    overrideAccess: true,
  })

  let scanned = 0
  let enqueued = 0
  let skippedActive = 0
  const jobIds: Array<string | number> = []

  for (const doc of jobs.docs as Array<{
    id?: string | number
    site?: unknown
    status?: string | null
    errorMessage?: string | null
    input?: unknown
    updatedAt?: string | null
    startedAt?: string | null
    createdAt?: string | null
  }>) {
    scanned += 1
    if (doc.id == null) {
      skippedActive += 1
      continue
    }

    const siteId = relationIdNumber(doc.site) ?? relationIdNumber((doc.input as { siteId?: unknown } | null)?.siteId)
    if (siteId == null || siteId <= 0) {
      const lease = await claimWorkflowJob(payload, doc.id, { runner: true })
      if (lease) {
        try { await patchLeasedWorkflowJob(lease, { status: 'failed', errorCode: 'INVALID_RUNNER_INPUT', errorMessage: 'Runner has no valid site ID', completedAt: new Date().toISOString() }) }
        finally { await releaseWorkflowLease(lease) }
      }
      continue
    }

    const message: ContentWorkflowQueueMessage = {
      type: CONTENT_WORKFLOW_MESSAGE_SITE_RUNNER,
      siteId,
      runnerJobId: doc.id,
      input: inputFromUnknown(doc.input, siteId),
    }
    await enqueueContentWorkflowMessage(queue, message)
    enqueued += 1
    jobIds.push(doc.id)
  }

  return Response.json({
    ok: true,
    scanned,
    recoveredJobs,
    enqueued,
    skippedActive,
    jobIds,
  })
}
