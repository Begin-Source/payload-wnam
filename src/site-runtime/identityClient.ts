import type { IdentityResult, SiteIdentityRPC } from '../site-control/identityService'
import { assertAdminHost } from '../site-control/registry'
import { SiteAccessDeniedError, type SitePrincipal } from '../site-control/sso'
import { requireSiteContext } from './context'

export class SiteIdentityUnavailableError extends Error {}
export async function callSiteIdentity<T>(call: () => Promise<IdentityResult<T>>): Promise<T> {
  let result: IdentityResult<T>
  try { result = await call() } catch { throw new SiteIdentityUnavailableError('Identity service unavailable') }
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new SiteIdentityUnavailableError('Invalid identity response')
  if (!result.ok) {
    if (result.reason === 'denied') throw new SiteAccessDeniedError('Site access denied')
    throw new SiteIdentityUnavailableError('Identity service unavailable')
  }
  return result.value
}

/** Pass directly to centralSiteStrategy. The binding is supplied by the site
 * Worker; no public HTTP URL, bearer admin token, or cached grant fallback.
 */
export function siteIdentityAuthenticator(service: SiteIdentityRPC) {
  return async (session: string, siteId: string, adminHost: string): Promise<SitePrincipal> => {
    const context = requireSiteContext()
    assertAdminHost(context.siteId, context.requestHost ?? '')
    if (siteId !== context.siteId || adminHost !== context.requestHost) throw new SiteAccessDeniedError('Identity context mismatch')
    const principal = await callSiteIdentity(() => service.authenticate(session, context.siteId, adminHost))
    // Validate runtime data and routing again after the asynchronous RPC.
    const current = requireSiteContext()
    if (!principal || principal.siteId !== current.siteId || principal.routingVersion !== current.routingVersion ||
      typeof principal.userId !== 'string' || !/^[1-9][0-9]*$/.test(principal.userId) || !Number.isSafeInteger(Number(principal.userId)) ||
      typeof principal.displayName !== 'string' || !['viewer','editor','publisher','manager'].includes(principal.role)) {
      throw new SiteIdentityUnavailableError('Invalid identity response')
    }
    return Object.freeze({ siteId: principal.siteId, routingVersion: principal.routingVersion,
      userId: principal.userId, displayName: principal.displayName, role: principal.role })
  }
}
