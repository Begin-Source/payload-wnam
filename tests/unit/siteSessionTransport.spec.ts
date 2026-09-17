// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { SiteIdentityRPC } from '../../src/site-control/identityService'
import { centralIdentityFromPayload, centralSiteEntry } from '../../src/site-control/centralSiteEntry'
import { CENTRAL_ORIGIN } from '../../src/site-control/sessionHttp'
import { SiteAccessDeniedError } from '../../src/site-control/sso'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { siteIdentityAuthenticator } from '../../src/site-runtime/identityClient'
import { siteSessionGateway } from '../../src/site-runtime/sessionGateway'

const token = 'a'.repeat(64)
const site: SiteContext = { siteId: 'a', localSiteId: 37, binding: { prepare() {} } as unknown as D1Database,
  routingVersion: 1, currentRoutingVersion: () => 1, identity: null, requestHost: 'cms-site-a.beginos.org' }
const principal = { siteId: 'a', localSiteId: 37, routingVersion: 1, userId: '7', displayName: 'Staff', role: 'editor' as const }
function rpc() {
  return { authenticate: vi.fn(async () => ({ ok: true as const, value: principal })),
    redeem: vi.fn(async () => ({ ok: true as const, value: { session: token, expiresAt: Date.now() + 60_000 } })),
    logout: vi.fn(async () => ({ ok: true as const, value: null })) }
}
function post(url: string, origin: string, body: string) {
  return new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body })
}
const entry = (body = 'siteId=a', origin = CENTRAL_ORIGIN) => post(`${CENTRAL_ORIGIN}/auth/enter-site`, origin, body)
const login = (body = `ticket=${token}`, origin = CENTRAL_ORIGIN) => post('https://cms-site-a.beginos.org/auth/site-login', origin, body)

describe('central and site HTTP session boundaries', () => {
  it('keeps staging and production SSO origins separate for entry, redemption and logout', async () => {
    const centralOrigin = 'https://p1-hub.beginos.org'
    const issueTicket = vi.fn(async () => ({ ticket: token, adminOrigin: 'https://cms-site-a.beginos.org', expiresAt: Date.now() + 60_000 }))
    const options = { centralOrigin, broker: { issueTicket }, authenticate: vi.fn(async () => ({ userId: '7',sessionId: 'verified' })) }
    expect((await centralSiteEntry(entry(),options)).status).toBe(404)
    expect((await centralSiteEntry(post(`${centralOrigin}/auth/enter-site`,CENTRAL_ORIGIN,'siteId=a'),options)).status).toBe(403)
    expect(issueTicket).not.toHaveBeenCalled()
    expect((await centralSiteEntry(post(`${centralOrigin}/auth/enter-site`,centralOrigin,'siteId=a'),options)).status).toBe(200)
    await withSiteContext(site,async () => {
      const service = rpc()
      expect((await siteSessionGateway(login(),service,centralOrigin))?.status).toBe(403)
      expect(service.redeem).not.toHaveBeenCalled()
      expect((await siteSessionGateway(login(`ticket=${token}`,centralOrigin),service,centralOrigin))?.status).toBe(303)
      const logout = await siteSessionGateway(post('https://cms-site-a.beginos.org/auth/site-logout','https://cms-site-a.beginos.org',''),service,centralOrigin)
      expect(logout?.headers.get('location')).toBe(centralOrigin)
    })
  })
  it('uses only the verified Payload JWT session and disables automatic login', async () => {
    const auth = vi.fn(async (_options: { headers: Headers }) => ({ user: { id: 7, collection: 'users', _strategy: 'local-jwt', _sid: 'verified-session' } }))
    const payload = { auth } as unknown as Payload
    expect(await centralIdentityFromPayload(payload, entry('siteId=a&userId=99'))).toEqual({ userId: '7', sessionId: 'verified-session' })
    expect(auth.mock.calls[0][0].headers.get('DisableAutologin')).toBe('true')
    for (const user of [null, { id: 7, collection: 'users', _strategy: 'api-key', _sid: 'forged' },
      { id: 7, collection: 'users', _strategy: 'local-jwt' }]) {
      auth.mockResolvedValueOnce({ user } as never)
      expect(await centralIdentityFromPayload(payload, entry())).toBeNull()
    }
  })

  it('hands off a ticket in a no-store POST form with a restricted CSP and fixed destination', async () => {
    const issueTicket = vi.fn(async () => ({ ticket: token, adminOrigin: 'https://cms-site-a.beginos.org', expiresAt: Date.now() + 60_000 }))
    const authenticate = vi.fn(async () => ({ userId: '7', sessionId: 'verified-session' }))
    const response = await centralSiteEntry(entry(), { broker: { issueTicket }, authenticate })
    expect(response.status).toBe(200)
    expect(issueTicket).toHaveBeenCalledWith('a', { userId: '7', sessionId: 'verified-session' })
    const html = await response.text()
    expect(html).toContain('method="post" action="https://cms-site-a.beginos.org/auth/site-login"')
    expect(html).toContain(`name="ticket" value="${token}"`)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin')
    expect(response.headers.get('content-security-policy')).toContain('form-action https://cms-site-a.beginos.org')
    expect(response.headers.get('content-security-policy')).toContain("script-src 'nonce-")
  })

  it('rejects forged identity fields, duplicate form values, oversized bodies and cross-origin issuance before authentication', async () => {
    const options = { broker: { issueTicket: vi.fn() }, authenticate: vi.fn() }
    for (const body of ['siteId=a&userId=7', 'siteId=a&sessionId=forged', 'siteId=a&siteId=b', 'siteId=' + 'a'.repeat(600)]) {
      expect((await centralSiteEntry(entry(body), options)).status).toBe(400)
    }
    expect((await centralSiteEntry(entry('siteId=a', 'https://cms-site-a.beginos.org'), options)).status).toBe(403)
    expect((await centralSiteEntry(new Request(`${CENTRAL_ORIGIN}/auth/enter-site?ticket=${token}`), options)).status).toBe(404)
    expect(options.authenticate).not.toHaveBeenCalled()
    expect(options.broker.issueTicket).not.toHaveBeenCalled()
  })

  it('does not issue for anonymous users and sanitizes infrastructure errors', async () => {
    const issueTicket = vi.fn()
    expect((await centralSiteEntry(entry(), { broker: { issueTicket }, authenticate: async () => null })).status).toBe(401)
    expect(issueTicket).not.toHaveBeenCalled()
    const response = await centralSiteEntry(entry(), { broker: { issueTicket }, authenticate: async () => { throw new Error('SQL password secret') } })
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
  })

  it('redeems only the central-origin form and sets a host-only cookie before a fixed redirect', async () => {
    const service = rpc()
    await withSiteContext(site, async () => {
      const response = (await siteSessionGateway(login(), service))!
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/admin')
      expect(response.headers.get('set-cookie')).toContain(`__Host-site-session=${token}; Path=/;`)
      expect(response.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Strict')
      expect(response.headers.get('set-cookie')).not.toContain('Domain=')
      expect(service.redeem).toHaveBeenCalledWith(token, 'a', site.requestHost)
      service.redeem.mockClear()
      for (const origin of ['null', 'https://public.example', 'https://cms-site-b.beginos.org']) {
        expect((await siteSessionGateway(login(undefined, origin), service))?.status).toBe(403)
      }
      expect((await siteSessionGateway(login(`ticket=${token}&returnTo=https://evil.example`), service))?.status).toBe(400)
      expect(service.redeem).not.toHaveBeenCalled()
    })
  })

  it('ignores forwarded hosts and refuses redemption without a trusted context', async () => {
    await expect(siteSessionGateway(login(), rpc())).rejects.toThrow('context required')
    await withSiteContext(site, async () => {
      const wrong = post('https://cms-site-b.beginos.org/auth/site-login', CENTRAL_ORIGIN, `ticket=${token}`)
      wrong.headers.set('x-forwarded-host', site.requestHost!)
      expect((await siteSessionGateway(wrong, rpc()))?.status).toBe(404)
      expect(await siteSessionGateway(new Request('https://public.example/article'), rpc())).toBeNull()
    })
  })

  it('requires same-origin logout and clears local credentials even when central is unavailable', async () => {
    const service = rpc()
    const request = () => {
      const r = post('https://cms-site-a.beginos.org/auth/site-logout', 'https://cms-site-a.beginos.org', '')
      r.headers.set('cookie', `__Host-site-session=${token}`)
      return r
    }
    await withSiteContext(site, async () => {
      const forged = request(); forged.headers.set('origin', CENTRAL_ORIGIN)
      expect((await siteSessionGateway(forged, service))?.status).toBe(403)
      expect(service.logout).not.toHaveBeenCalled()
      expect((await siteSessionGateway(request(), service))?.status).toBe(303)
      service.logout.mockRejectedValueOnce(new Error('Central down: private detail'))
      const response = (await siteSessionGateway(request(), service))!
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
      expect(await response.text()).not.toContain('private detail')
    })
  })

  it('rechecks routing after RPC and rejects malformed or cross-site principals', async () => {
    const service = rpc()
    await withSiteContext(site, async () => {
      const authenticate = siteIdentityAuthenticator(service)
      expect(await authenticate(token, 'a', site.requestHost!)).toEqual(principal)
      await expect(authenticate(token, 'b', site.requestHost!)).rejects.toThrow('context mismatch')
      service.authenticate.mockResolvedValueOnce({ ok: true, value: { ...principal, siteId: 'b' } })
      await expect(authenticate(token, 'a', site.requestHost!)).rejects.toThrow('Invalid identity')
      service.authenticate.mockResolvedValueOnce({ ok: true, value: { ...principal, localSiteId: 82 } })
      await expect(authenticate(token, 'a', site.requestHost!)).rejects.toThrow('Invalid identity')
      const denied: SiteIdentityRPC = { ...rpc(), authenticate: async () => ({ ok: false, reason: 'denied' }) }
      await expect(siteIdentityAuthenticator(denied)(token, 'a', site.requestHost!)).rejects.toBeInstanceOf(SiteAccessDeniedError)
    })
    let version = 1
    const changesRoute: SiteIdentityRPC = { ...rpc(), authenticate: async () => { version++; return { ok: true, value: principal } } }
    await withSiteContext({ ...site, currentRoutingVersion: () => version }, async () => {
      await expect(siteIdentityAuthenticator(changesRoute)(token, 'a', site.requestHost!)).rejects.toThrow('Stale')
    })
  })
})
