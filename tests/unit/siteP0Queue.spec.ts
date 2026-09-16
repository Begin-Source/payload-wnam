// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { p0Queue } from '../../src/site-runtime/p0Queue'
import { requireSiteContext } from '../../src/site-runtime/context'
import type { P0Task } from '../../src/site-runtime/p0Ingress'

it('runs queued full-app requests in their trusted site context and acknowledges only success', async () => {
  const binding = { prepare() {} } as unknown as D1Database
  const env = { SITE_ISOLATION_P0: '1', SITE_D1_A: binding, SITE_D1_B: binding, R2: {} as R2Bucket,
    P0_GATE_SECRET: 'p0-queue-test-only-gate-with-32-characters', PAYLOAD_SECRET: 'synthetic-payload-secret' }
  const messages = ['p0-a', 'p0-b'].map(siteId => ({ body: { type: 'p0-isolation', siteId, jobId: 1, routingVersion: 1 }, ack: vi.fn() }))
  const batch = { messages } as unknown as MessageBatch<P0Task>
  const next = vi.fn(async (request: Request) => {
    const site = requireSiteContext().siteId
    expect(new URL(request.url).hostname).toBe(`${site}.beginos.org`)
    expect(await request.json()).toEqual({ operation: 'execute', jobId: 1 })
    return Response.json({ site })
  })
  await p0Queue(batch, env, {} as ExecutionContext, next)
  for (const message of messages) expect(message.ack).toHaveBeenCalledOnce()
  messages[0].ack.mockClear()
  await expect(p0Queue({ messages: [messages[0]] } as unknown as MessageBatch<P0Task>, env, {} as ExecutionContext,
    async () => new Response('failure', { status: 500 }))).rejects.toThrow('P0 task endpoint failed')
  expect(messages[0].ack).not.toHaveBeenCalled()
  await expect(p0Queue({ messages: [{ ...messages[0], body: { ...messages[0].body, siteId: 'attacker' } }] } as unknown as MessageBatch<P0Task>,
    env, {} as ExecutionContext, next)).rejects.toThrow('Unknown P0 queue site')
})
