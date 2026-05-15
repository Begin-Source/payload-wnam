import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runSiteContentRunner } from '@/utilities/siteContentRunner'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/site-content-runner'
const HARD_FAILURE_REASONS = new Set(['failure', 'aborted', 'no_progress'])

function numberFromBody(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(n) ? Math.floor(n) : null
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = numberFromBody(body.siteId)
  if (siteId == null) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const result = await runSiteContentRunner({
    payload,
    origin: new URL(request.url).origin,
    runnerJobId:
      typeof body.runnerJobId === 'string' || typeof body.runnerJobId === 'number'
        ? body.runnerJobId
        : null,
    input: {
      siteId,
      batchMaxRuns: numberFromBody(body.batchMaxRuns) ?? undefined,
      batchBudgetMs: numberFromBody(body.batchBudgetMs) ?? undefined,
      maxBatches: numberFromBody(body.maxBatches) ?? undefined,
      stopOnFailure: body.stopOnFailure !== false,
    },
    partialAsRunning: body.partialAsRunning === true,
  })

  const httpStatus = result.failureSummary || HARD_FAILURE_REASONS.has(result.stoppedReason) ? 500 : 200
  return Response.json(result, { status: httpStatus })
}
