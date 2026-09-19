import { describe, expect, it, vi } from 'vitest'
import { siteFetch } from '../../src/application-roles/siteIngress'
import { requireSiteEnvironment, type SiteEnvironment } from '../../src/application-roles/siteEnvironment'
import { requireSiteContext } from '../../src/site-runtime/context'
import type { SiteRoute } from '../../src/site-control/routingService'
import type { SiteIdentityRPC } from '../../src/site-control/identityService'

const route = (siteId = 'a', version = 1): SiteRoute => ({ siteId, localSiteId: siteId === 'a' ? 37 : 82,
  databaseId: `00000000-0000-0000-0000-00000000000${siteId === 'a' ? 1 : 2}`, bindingName: `SITE_D1_${siteId.toUpperCase()}`,
  workerGroup: 'group-1', adminHost: `cms-site-${siteId}.beginos.org`, schemaVersion: 1, routingVersion: version, migrationState: 'active' })
function bindings(): SiteEnvironment {
  const routes = ['a','b'].map(id => route(id))
  return { CENTRAL_ORIGIN: 'https://agenthub.beginos.org', PAYLOAD_SECRET: 'independent-site-runtime-test-secret', WORKER_GROUP: 'group-1', SITE_ROUTES: JSON.stringify(routes),
    SITE_D1_A: { prepare: vi.fn() } as unknown as D1Database, SITE_D1_B: { prepare: vi.fn() } as unknown as D1Database,
    SITE_PUBLIC: { get: vi.fn(), put: vi.fn() } as unknown as R2Bucket, SITE_PRIVATE: { get: vi.fn(), put: vi.fn() } as unknown as R2Bucket,
    DATA: { readMaster: vi.fn(), readConfig: vi.fn(), readAsset: vi.fn() },
    ROUTING: { resolve: vi.fn(async id => route(id)) }, IDENTITY: { redeem: vi.fn(), logout: vi.fn<SiteIdentityRPC['logout']>(async () => ({ ok: true, value: null })),
      authenticate: vi.fn<SiteIdentityRPC['authenticate']>(async (_session, id) => ({ ok: true, value: { siteId: id, localSiteId: id === 'a' ? 37 : 82, routingVersion: 1,
        userId: '7', displayName: 'Staff', role: 'editor' } })) } }
}
const request = (site = 'a', path = '/admin', method = 'GET') => new Request(`https://cms-site-${site}.beginos.org${path}`, {
  method, headers: { cookie: `__Host-site-session=${'a'.repeat(64)}`, origin: `https://cms-site-${site}.beginos.org`,
    'x-forwarded-host': 'evil.example', 'x-site-id': 'b' },
})
const ctx = {} as ExecutionContext

describe('complete site application ingress', () => {
  it('requires explicit central origin and redirects anonymous pilot visitors to their own central', async () => {
    expect(() => requireSiteEnvironment({ ...bindings(),CENTRAL_ORIGIN: undefined })).toThrow()
    const env = { ...bindings(),CENTRAL_ORIGIN: 'https://p1-hub.beginos.org' }
    const result = await siteFetch(new Request('https://cms-site-a.beginos.org/admin'),env,ctx,vi.fn())
    expect(result.headers.get('location')).toBe('https://p1-hub.beginos.org/admin')
  })
  it('rejects fallback, duplicate D1 ownership and unconfigured hosts', async () => {
    expect(() => requireSiteEnvironment({ D1: {}, R2: {} })).toThrow()
    const env = bindings(), routes = JSON.parse(env.SITE_ROUTES)
    routes[1].databaseId = routes[0].databaseId
    expect(() => requireSiteEnvironment({ ...env, SITE_ROUTES: JSON.stringify(routes) })).toThrow()
    const next = vi.fn()
    expect((await siteFetch(request('unknown'), env, ctx, next)).status).toBe(421)
    expect((await siteFetch(new Request('https://evil.example/admin', { headers: { 'x-forwarded-host': route().adminHost } }), env, ctx, next)).status).toBe(421)
    expect(env.ROUTING.resolve).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
  it('serves concurrent sites in separate immutable scopes and normalizes headers', async () => {
    const env = bindings()
    const next = vi.fn(async (req: Request) => {
      const scope = requireSiteContext()
      await Promise.resolve()
      expect(requireSiteContext()).toBe(scope)
      expect(scope.binding).toBe(scope.siteId === 'a' ? env.SITE_D1_A : env.SITE_D1_B)
      expect(req.headers.get('x-forwarded-host')).toBe(scope.requestHost)
      expect(req.headers.get('x-site-id')).toBeNull()
      return new Response(scope.siteId)
    })
    const results = await Promise.all(['a','b','a','b'].map(id => siteFetch(request(id), env, ctx, next)))
    expect(await Promise.all(results.map(r => r.text()))).toEqual(['a','b','a','b'])
    expect(results.every(r => r.headers.get('cache-control') === 'private, no-store')).toBe(true)
  })
  it('denies mismatched registry bindings before Next or D1 access', async () => {
    const env = bindings(), next = vi.fn()
    vi.mocked(env.ROUTING.resolve).mockResolvedValue({ ...route(), databaseId: route('b').databaseId })
    expect((await siteFetch(request(), env, ctx, next)).status).toBe(503)
    expect(next).not.toHaveBeenCalled()
    expect(env.SITE_D1_A.prepare).not.toHaveBeenCalled()
  })
  it('rechecks identity on every request and fails closed on revocation or outage', async () => {
    const env = bindings(), next = vi.fn(async () => new Response('ok'))
    expect((await siteFetch(request(), env, ctx, next)).status).toBe(200)
    vi.mocked(env.IDENTITY.authenticate).mockResolvedValue({ ok: false, reason: 'denied' })
    expect((await siteFetch(request(), env, ctx, next)).status).toBe(403)
    vi.mocked(env.IDENTITY.authenticate).mockRejectedValue(new Error('unavailable'))
    expect((await siteFetch(request('a', '/api/categories', 'POST'), env, ctx, next)).status).toBe(503)
    expect(next).toHaveBeenCalledOnce()
  })
  it('denies cross-origin writes and sends unauthenticated admin visits to central', async () => {
    const env = bindings(), next = vi.fn()
    expect((await siteFetch(new Request(`https://${route().adminHost}/api/categories`, { method: 'POST', headers: { origin: 'https://evil.example' } }), env, ctx, next)).status).toBe(403)
    const anonymous = await siteFetch(new Request(`https://${route().adminHost}/admin/login`), env, ctx, next)
    expect(anonymous.status).toBe(303)
    expect(anonymous.headers.get('location')).toBe('https://agenthub.beginos.org/admin')
    expect(next).not.toHaveBeenCalled()
  })
  it('fences an in-flight scope when another request observes a newer paused route', async () => {
    const env = bindings()
    let entered!: () => void, release!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const first = siteFetch(request(), env, ctx, async () => { entered(); await gate; requireSiteContext(); return new Response('must not finish') })
    const denied = expect(first).rejects.toThrow('Stale site routing version')
    await ready
    vi.mocked(env.ROUTING.resolve).mockResolvedValue({ ...route('a', 2), migrationState: 'paused' })
    expect((await siteFetch(request(), env, ctx, vi.fn())).status).toBe(503)
    release(); await denied
    vi.mocked(env.ROUTING.resolve).mockResolvedValue(route())
    expect((await siteFetch(request(), env, ctx, vi.fn())).status).toBe(503)
  })
  it('native logout revokes the central session even if routing is unavailable', async () => {
    const env = bindings()
    vi.mocked(env.ROUTING.resolve).mockRejectedValue(new Error('offline'))
    const result = await siteFetch(request('a', '/api/users/logout', 'POST'), env, ctx, vi.fn())
    expect(result.status).toBe(200)
    expect(result.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(env.IDENTITY.logout).toHaveBeenCalledOnce()
    expect(env.ROUTING.resolve).not.toHaveBeenCalled()
    vi.mocked(env.IDENTITY.logout).mockRejectedValue(new Error('offline'))
    const failed = await siteFetch(request('a', '/auth/site-logout', 'POST'), env, ctx, vi.fn())
    expect(failed.status).toBe(503)
    expect(failed.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
