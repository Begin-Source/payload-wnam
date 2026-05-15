import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  CONTENT_WORKFLOW_MESSAGE_SITE_RUNNER,
  enqueueContentWorkflowMessage,
  getContentWorkflowQueueFromOpenNext,
  type ContentWorkflowQueueMessage,
} from '@/utilities/contentWorkflowQueue'
import { SITE_CONTENT_RUNNER_JOB_TYPE, type SiteContentRunnerInput } from '@/utilities/siteContentRunner'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/content-workflow/kick'
const RUNNER_STALE_MS = 5 * 60 * 1000

function numberFromBody(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function timestampMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
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

function runnerNeedsKick(doc: {
  status?: string | null
  errorMessage?: string | null
  updatedAt?: string | null
  startedAt?: string | null
  createdAt?: string | null
}): boolean {
  if (doc.status === 'pending') return true
  if (
    doc.status === 'failed' &&
    typeof doc.errorMessage === 'string' &&
    (doc.errorMessage.includes('error code: 1003') ||
      doc.errorMessage.includes('tick 返回非 JSON（403）'))
  ) {
    return true
  }
  if (doc.status !== 'running') return false
  const last =
    timestampMs(doc.updatedAt) ?? timestampMs(doc.startedAt) ?? timestampMs(doc.createdAt)
  return last == null || Date.now() - last > RUNNER_STALE_MS
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
  const jobs = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: SITE_CONTENT_RUNNER_JOB_TYPE } },
        { status: { in: ['pending', 'running', 'failed'] } },
      ],
    },
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
    if (doc.id == null || !runnerNeedsKick(doc)) {
      skippedActive += 1
      continue
    }

    const siteId = relationIdNumber(doc.site) ?? relationIdNumber((doc.input as { siteId?: unknown } | null)?.siteId)
    if (siteId == null) continue

    if (doc.status === 'running' || doc.status === 'failed') {
      await payload.update({
        collection: 'workflow-jobs',
        id: doc.id,
        data: {
          status: 'pending',
          errorMessage: '',
          output: {
            ok: true,
            recoveredFromStaleRunner: true,
            recoveredAt: new Date().toISOString(),
          },
        },
        overrideAccess: true,
      })
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
    enqueued,
    skippedActive,
    jobIds,
  })
}
