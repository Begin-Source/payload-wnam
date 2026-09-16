// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { p0Fetch } from '../../src/site-runtime/p0Ingress'
import { requireSiteContext } from '../../src/site-runtime/context'

const secret = 'p0-test-only-secret-with-32-characters'
const cookie = `__Host-p0-access=${secret}`
const db = (name: string) => ({ prepare: () => ({ first: async () => name }) }) as unknown as D1Database
const env = { SITE_D1_A: db('a'), SITE_D1_B: db('b'), R2: {} as R2Bucket, P0_GATE_SECRET: secret }
const ctx = {} as ExecutionContext

describe('P0 trusted ingress', () => {
  it('rejects unknown hosts, missing configuration and unauthenticated requests before Next', async () => {
    const next = vi.fn()
    expect((await p0Fetch(new Request('https://example.com/'), env, ctx, next)).status).toBe(421)
    expect((await p0Fetch(new Request('https://p0-a.beginos.org/'), { ...env, P0_GATE_SECRET: '' }, ctx, next)).status).toBe(503)
    expect((await p0Fetch(new Request('https://p0-a.beginos.org/'), env, ctx, next)).status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('issues only a secure host cookie after authenticating the session request', async () => {
    const response = await p0Fetch(new Request('https://p0-a.beginos.org/__p0/session', {
      method: 'POST', headers: { authorization: `Bearer ${secret}` },
    }), env, ctx, vi.fn())
    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toContain('Path=/; Secure; HttpOnly; SameSite=Strict')
    expect(response.headers.get('set-cookie')).not.toContain('Domain=')
  })

  it('isolates concurrent Next calls and deferred streams despite forged site headers', async () => {
    const responses = await Promise.all(['a', 'b'].map(site => p0Fetch(new Request(`https://p0-${site}.beginos.org/`, {
      headers: { cookie, 'x-site-id': 'attacker', 'x-forwarded-host': 'p0-b.beginos.org' },
    }), env, ctx, async (_request, scoped) => {
      expect(requireSiteContext().siteId).toBe(`p0-${site}`)
      expect(await scoped.D1.prepare('SELECT 1').first()).toBe(site)
      return new Response(site)
    })))
    expect(await Promise.all(responses.map(response => response.text()))).toEqual(['a', 'b'])
    expect(() => requireSiteContext()).toThrow('context required')
    for (const response of responses) expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
