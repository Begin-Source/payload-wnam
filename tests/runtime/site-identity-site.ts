import type { SiteIdentityService } from '../../src/site-control/identityService'
import { withSiteContext } from '../../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { siteIdentityAuthenticator } from '../../src/site-runtime/identityClient'
import { centralSiteStrategy, assertSiteWriteOrigin } from '../../src/site-runtime/siteIdentity'
import { siteSessionGateway } from '../../src/site-runtime/sessionGateway'
import type { PayloadRequest } from 'payload'
import type { SiteDataService } from '../../src/site-control/dataService'
import { siteDataClient, SiteDataUnavailableError } from '../../src/site-runtime/dataClient'
import { receiveMasterRelease } from '../../src/site-runtime/masterReceiver'
import { receiveConfigRelease } from '../../src/site-runtime/configReceiver'
import { copyAssetToSite, synchronizeAssetWithdrawal } from '../../src/site-runtime/assetCopies'
import { siteSessionFromHeaders } from '../../src/site-runtime/siteIdentity'

export default {
  async fetch(request: Request, env: { IDENTITY: Service<typeof SiteIdentityService>; DATA: Service<typeof SiteDataService>;
    SITE_A: D1Database; SITE_B: D1Database; SITE_PUBLIC: R2Bucket; SITE_PRIVATE: R2Bucket }) {
    const url = new URL(request.url)
    if (url.hostname === 'public.example') return new Response('Public read independent of central')
    const siteId = url.hostname === 'cms-site-a.beginos.org' ? 'a' : url.hostname === 'cms-site-b.beginos.org' ? 'b' : null
    if (!siteId) return new Response('Unknown host', { status: 421 })
    return withSiteContext({ siteId, localSiteId: siteId === 'a' ? 37 : 82, binding: siteId === 'a' ? env.SITE_A : env.SITE_B,
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
      if (url.pathname === '/test/data-no-http') return env.DATA.fetch('https://internal.example/download')
      if (url.pathname === '/test/data-no-publisher') {
        try {
          await (env.DATA as unknown as { publishMaster(): Promise<unknown> }).publishMaster()
          return new Response('Publisher exposed',{ status: 500 })
        } catch { return new Response('Publisher absent') }
      }
      try {
        assertSiteWriteOrigin(request.method, request.headers, url.hostname)
        // Deliberately bypass the client scope check in this non-deployed probe
        // to prove the named central RPC itself rejects forged destinations.
        if (url.pathname === '/test/data-raw') {
          if (request.method !== 'POST') return new Response('Method not allowed',{ status: 405 })
          const input = await request.json() as { siteId: string; adminHost: string; routingVersion: number; ref: Parameters<SiteDataService['readMaster']>[1] }
          return Response.json(await env.DATA.readMaster({ session: siteSessionFromHeaders(request.headers) ?? '',siteId: input.siteId,
            adminHost: input.adminHost,routingVersion: input.routingVersion },input.ref))
        }
        const strategy = centralSiteStrategy({
          authenticateSession: siteIdentityAuthenticator(env.IDENTITY),
          loadProjection: syncSiteIdentityProjection,
        })
        const { user } = await strategy.authenticate({ headers: request.headers } as Parameters<typeof strategy.authenticate>[0])
        if (!user) return new Response('Login required', { status: 401 })
        if (url.pathname.startsWith('/test/data/')) {
          if (request.method !== 'POST') return new Response('Method not allowed',{ status: 405 })
          // Minimal runtime fixture request, not the formal full Payload role.
          const req = { user,headers: request.headers,payload: { config: { custom: { payloadRole: 'site' } } } } as unknown as PayloadRequest
          const capability = siteDataClient(req,env.DATA),kind = url.pathname.split('/').at(-1)
          if (kind === 'master') {
            const ref = await request.json() as Parameters<typeof receiveMasterRelease>[0]
            await receiveMasterRelease(ref,capability)
          } else if (kind === 'config') {
            const ref = await request.json() as Parameters<typeof receiveConfigRelease>[0]
            await receiveConfigRelease(ref,capability)
          } else if (kind === 'asset' || kind === 'withdraw') {
            const ref = await request.json() as Parameters<typeof copyAssetToSite>[1]
            const buckets = { publicBucket: env.SITE_PUBLIC,privateBucket: env.SITE_PRIVATE }
            if (kind === 'asset') return Response.json({ localId: await copyAssetToSite(req,ref,`rpc-copy-${ref.recordId}`,capability,buckets) })
            await synchronizeAssetWithdrawal(req,ref,`rpc-withdraw-${ref.recordId}`,capability,buckets)
          } else return new Response('Unknown data fixture',{ status: 404 })
          return Response.json({ ok: true })
        }
        return Response.json(user)
      } catch (error) { return new Response(error instanceof SiteDataUnavailableError ? 'Data unavailable' : 'Access denied',
        { status: error instanceof SiteDataUnavailableError ? 503 : 403 }) }
    })
  },
}
