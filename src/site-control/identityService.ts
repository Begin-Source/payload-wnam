import { WorkerEntrypoint } from 'cloudflare:workers'
import { assertAdminHost } from './registry'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import { SiteAccessDeniedError, SiteLoginBroker, type SitePrincipal } from './sso'

export type IdentityResult<T> = { ok: true; value: T } | { ok: false; reason: 'denied' | 'unavailable' }
export type SiteSession = { session: string; expiresAt: number }
export interface SiteIdentityRPC {
  authenticate(session: string, siteId: string, adminHost: string): Promise<IdentityResult<SitePrincipal>>
  redeem(ticket: string, siteId: string, adminHost: string): Promise<IdentityResult<SiteSession>>
  logout(session: string, siteId: string, adminHost: string): Promise<IdentityResult<null>>
}

/** Named internal entrypoint only. Central HTTP owns ticket issuance; this
 * capability cannot mint tickets from caller-supplied user/session identities.
 * No database, broker, or session authority is exposed as an RPC method.
 */
export class SiteIdentityService extends WorkerEntrypoint<{ CENTRAL_D1: D1Database }> implements SiteIdentityRPC {
  fetch(): Response { return new Response('Not found', { status: 404 }) }

  async #run<T>(siteId: string, adminHost: string, action: (broker: SiteLoginBroker) => Promise<T>): Promise<IdentityResult<T>> {
    try { assertAdminHost(siteId, adminHost) } catch { return { ok: false, reason: 'denied' } }
    try {
      const broker = new SiteLoginBroker(this.env.CENTRAL_D1, payloadSessionAuthority(this.env.CENTRAL_D1))
      return { ok: true, value: await action(broker) }
    } catch (error) {
      // Never send SQL, user records, tokens or raw infrastructure errors across RPC.
      return { ok: false, reason: error instanceof SiteAccessDeniedError ? 'denied' : 'unavailable' }
    }
  }

  authenticate(session: string, siteId: string, adminHost: string) {
    return this.#run(siteId, adminHost, broker => broker.authenticate(session, siteId, adminHost))
  }

  redeem(ticket: string, siteId: string, adminHost: string) {
    return this.#run(siteId, adminHost, async broker => {
      const { session, expiresAt } = await broker.redeemTicket(ticket, siteId, adminHost)
      return { session, expiresAt }
    })
  }

  logout(session: string, siteId: string, adminHost: string) {
    return this.#run(siteId, adminHost, async broker => {
      await broker.revokeSiteSession(session, siteId, adminHost)
      return null
    })
  }
}
