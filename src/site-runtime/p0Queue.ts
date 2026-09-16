import { p0Fetch, p0HostForSite, type P0Env, type P0Task } from './p0Ingress'

export async function p0Queue<E extends P0Env>(
  batch: MessageBatch<P0Task>, env: E, ctx: ExecutionContext,
  next: (request: Request, env: E & { D1: D1Database }, ctx: ExecutionContext) => Promise<Response>,
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body
    if (!body || body.type !== 'p0-isolation' || body.routingVersion !== 1 || !Number.isSafeInteger(body.jobId) || body.jobId < 1) {
      throw new Error('Invalid P0 queue message')
    }
    const host = p0HostForSite(body.siteId)
    if (!env.PAYLOAD_SECRET || !env.P0_GATE_SECRET) throw new Error('P0 queue configuration missing')
    const response = await p0Fetch(new Request(`https://${host}/api/p0/task-check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `__Host-p0-access=${env.P0_GATE_SECRET}`, 'x-internal-token': env.PAYLOAD_SECRET },
      body: JSON.stringify({ operation: 'execute', jobId: body.jobId }),
    }), env, ctx, next)
    // Consume the response in its bound scope, including any deferred Next work.
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`P0 task endpoint failed: ${response.status}`)
    message.ack()
  }
}
