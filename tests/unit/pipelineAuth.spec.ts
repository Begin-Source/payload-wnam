// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyPipelineRequest } from '@/app/api/pipeline/lib/auth'
import { pipelineV2Headers } from '@/app/api/pipeline/lib/pipelineSignature'
import { forwardPipelinePost } from '@/app/api/pipeline/lib/internalPipelineFetch'

const secret = 'ci-only-signing-secret'
const now = 1_789_562_400_000
const url = 'https://ci.test/api/pipeline/tick?site=4&mode=test'
const path = '/api/pipeline/tick'
const body = JSON.stringify({ execute: false })
const options = () => {
  const seen = new Set<string>()
  return { now, consumeNonce: vi.fn(async (key: string) => { if (seen.has(key)) return false; seen.add(key); return true }) }
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('pipeline authentication', () => {
  it('preserves exact header and query tokens', async () => {
    vi.stubEnv('PAYLOAD_SECRET', secret)
    expect((await verifyPipelineRequest(new Request(url, { headers: { 'x-internal-token': secret } }), path)).ok).toBe(true)
    expect((await verifyPipelineRequest(new Request(url + '&token=' + secret), path)).ok).toBe(true)
  })
  it('accepts fresh v1 and rejects expired, future and malformed signatures', async () => {
    vi.stubEnv('PAYLOAD_SECRET', secret)
    for (const [delta, expected] of [[0, true], [-301000, false], [31000, false]] as const) {
      const timestamp = String((now + delta) / 1000)
      const token = createHmac('sha256', secret).update(`GET:${path}:${timestamp}`).digest('hex')
      const req = new Request(url, { headers: { 'x-internal-token': token, 'x-pipeline-timestamp': timestamp } })
      expect((await verifyPipelineRequest(req, path, options())).ok).toBe(expected)
    }
    expect((await verifyPipelineRequest(new Request(url, { headers: { 'x-internal-token': 'ab' } }), path, options())).ok).toBe(false)
  })
  it('binds v2 to body, query, route and method without consuming the route body', async () => {
    vi.stubEnv('PAYLOAD_SECRET', secret)
    const headers = pipelineV2Headers(url, body, secret, now)
    const request = new Request(url, { method: 'POST', headers, body })
    expect((await verifyPipelineRequest(request, path, options())).ok).toBe(true)
    expect(await request.json()).toEqual({ execute: false })
    for (const [target, method, data, route] of [
      [url, 'POST', '{"execute":true}', path],
      [url.replace('site=4', 'site=5'), 'POST', body, path],
      [url, 'PUT', body, path],
      [url, 'POST', body, '/api/pipeline/triage'],
    ]) {
      const opts = options()
      expect((await verifyPipelineRequest(new Request(target, { method, headers, body: data }), route, opts)).ok).toBe(false)
      expect(opts.consumeNonce).not.toHaveBeenCalled()
    }
  })
  it('accepts a concurrent signed request once and fails closed if nonce storage fails', async () => {
    vi.stubEnv('PAYLOAD_SECRET', secret)
    const headers = pipelineV2Headers(url, body, secret, now)
    const request = () => new Request(url, { method: 'POST', headers, body })
    const opts = options()
    const result = await Promise.all([verifyPipelineRequest(request(), path, opts), verifyPipelineRequest(request(), path, opts)])
    expect(result.filter(r => r.ok)).toHaveLength(1)
    expect(await verifyPipelineRequest(request(), path, { now, consumeNonce: async () => { throw new Error('offline') } })).toMatchObject({ ok: false, status: 503 })
  })
  it('regenerates the signature when forwarding to another pipeline route', async () => {
    vi.stubEnv('PAYLOAD_SECRET', secret)
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await forwardPipelinePost(new Request(url + '&token=' + secret), '/api/pipeline/triage', { sample: 1 })
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toBe('https://ci.test/api/pipeline/triage')
    expect((await verifyPipelineRequest(new Request(target, init), '/api/pipeline/triage', { ...options(), now: Date.now() })).ok).toBe(true)
  })
})
