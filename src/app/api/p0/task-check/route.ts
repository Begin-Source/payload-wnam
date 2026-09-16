import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import { equalToken } from '@/app/api/pipeline/lib/pipelineSignature'
import { bindSiteCallback, requireSiteContext } from '@/site-runtime/context'
import { createSiteD1Proxy } from '@/site-runtime/d1'
import type { P0Env } from '@/site-runtime/p0Ingress'
import { consumePipelineNonce } from '@/utilities/pipelineNonceStore'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { claimWorkflowJob, heartbeatWorkflowLease, patchLeasedWorkflowJob, releaseWorkflowLease } from '@/utilities/workflowJobLease'

export const dynamic = 'force-dynamic'
const db = createSiteD1Proxy()

/** P0 only: exercise existing raw SQL helpers without calling any supplier. */
export async function POST(request: Request): Promise<Response> {
  const env = (await getCloudflareContext({ async: true })).env as unknown as P0Env
  if (env.SITE_ISOLATION_P0 !== '1') return new Response(null, { status: 404 })
  const context = requireSiteContext()
  const body = await request.json() as { operation?: string; jobId?: number; nonce?: string }
  if (!Number.isSafeInteger(body.jobId) || !body.jobId || body.jobId < 1) return new Response('Invalid job', { status: 400 })
  const { default: config } = await import('@payload-config')
  const payload = await getPayload({ config })
  if (body.operation === 'execute') {
    if (!env.PAYLOAD_SECRET || !equalToken(env.PAYLOAD_SECRET, request.headers.get('x-internal-token') ?? '')) {
      return new Response('Unauthorized', { status: 401 })
    }
  } else if (body.operation === 'enqueue' || body.operation === 'inspect') {
    const auth = await payload.auth({ headers: request.headers })
    if (!userHasUnscopedAdminAccess(auth.user)) return new Response('Unauthorized', { status: 403 })
  } else return new Response('Unknown operation', { status: 400 })
  const job = await payload.findByID({ collection: 'workflow-jobs', id: body.jobId, depth: 0 })
  if (job.jobType !== 'custom' || !job.input || typeof job.input !== 'object' ||
    !('p0Probe' in job.input) || job.input.p0Probe !== true) return new Response('Not a P0 probe', { status: 409 })

  if (body.operation === 'inspect') {
    const receipt = await db.prepare('SELECT deliveries FROM p0_queue_receipts WHERE job_id = ?').bind(body.jobId).first<{ deliveries: number }>()
    return Response.json({ deliveries: receipt?.deliveries ?? 0 })
  }

  if (body.operation === 'enqueue') {
    if (!env.P0_JOBS || !body.nonce || !/^[a-zA-Z0-9_-]{16,128}$/.test(body.nonce)) return new Response('Invalid P0 queue request', { status: 400 })
    const hash = createHash('sha256').update(body.nonce).digest('hex')
    const now = Date.now()
    const first = await consumePipelineNonce(hash, now + 60000, now)
    const replay = await consumePipelineNonce(hash, now + 60000, now)
    if (!first || replay) throw new Error('P0 nonce isolation failed')
    const message = { type: 'p0-isolation' as const, siteId: context.siteId, jobId: body.jobId, routingVersion: 1 as const }
    await env.P0_JOBS.sendBatch([{ body: message }, { body: message }])
    return Response.json({ siteId: context.siteId, nonceAccepted: first, replayAccepted: replay })
  }

  await db.prepare('INSERT INTO p0_queue_receipts (job_id, deliveries) VALUES (?, 1) ON CONFLICT(job_id) DO UPDATE SET deliveries = deliveries + 1').bind(body.jobId).run()
  const lease = await claimWorkflowJob(payload, body.jobId)
  if (!lease) return Response.json({ duplicate: true })
  try {
    await new Promise<void>(resolve => setTimeout(bindSiteCallback(resolve), 25))
    await heartbeatWorkflowLease(lease)
    await patchLeasedWorkflowJob(lease, { status: 'completed', completedAt: new Date().toISOString(), output: { siteId: context.siteId, p0Probe: true } })
  } finally { await releaseWorkflowLease(lease) }
  return Response.json({ completed: true, siteId: context.siteId })
}
