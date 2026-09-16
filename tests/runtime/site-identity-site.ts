import type { SiteIdentityService } from '../../src/site-control/identityService'
import { withSiteContext } from '../../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { siteIdentityAuthenticator } from '../../src/site-runtime/identityClient'
import { centralSiteStrategy, assertSiteWriteOrigin } from '../../src/site-runtime/siteIdentity'
import { siteSessionGateway } from '../../src/site-runtime/sessionGateway'

export default {
  async fetch(request: Request, env: { IDENTITY: Service<typeof SiteIdentityService>; SITE_A: D1Database; SITE_B: D1Database }) {
    const url = new URL(request.url)
    if (url.hostname === 'public.example') return new Response('Public read independent of central')
    const siteId = url.hostname === 'cms-site-a.beginos.org' ? 'a' : url.hostname === 'cms-site-b.beginos.org' ? 'b' : null
    if (!siteId) return new Response('Unknown host', { status: 421 })
    return withSiteContext({ siteId, binding: siteId === 'a' ? env.SITE_A : env.SITE_B,
      identity: null, routingVersion: 1, currentRoutingVersion: () => 1, requestHost: url.hostname }, async () => {
      const response = await siteSessionGateway(request, env.IDENTITY)
      if (response) return response
      if (url.pathname === '/test/no-issuer') {
        try {
          const forbidden = env.IDENTITY as unknown as { issueTicket(site: string, identity: unknown): Promise<unknown> }
          await forbidden.issueTicket(siteId, { userId: '7', sessionId: 'fixture-original-session' })
          return new Response('Issuer exposed', { status: 500 })
        } catch { return new Response('Issuer absent') }
      }
      if (url.pathname === '/test/no-http') return env.IDENTITY.fetch('https://internal.example/auth/enter-site')
      try {
        assertSiteWriteOrigin(request.method, request.headers, url.hostname)
        const strategy = centralSiteStrategy({
          authenticateSession: siteIdentityAuthenticator(env.IDENTITY),
          loadProjection: syncSiteIdentityProjection,
        })
        const { user } = await strategy.authenticate({ headers: request.headers } as Parameters<typeof strategy.authenticate>[0])
        if (!user) return new Response('Login required', { status: 401 })
        return Response.json(user)
      } catch { return new Response('Access denied', { status: 403 }) }
    })
  },
}
