import type { SiteIdentityRPC } from '../site-control/identityService'
import { CENTRAL_ORIGIN, requireCentralOrigin, SITE_LOGIN_PATH, SITE_LOGOUT_PATH, privateResponse, readSessionForm } from '../site-control/sessionHttp'
import { assertAdminHost } from '../site-control/registry'
import { SITE_SESSION_COOKIE, SiteAccessDeniedError } from '../site-control/sso'
import { requireSiteContext } from './context'
import { callSiteIdentity } from './identityClient'
import { assertSiteWriteOrigin, siteSessionFromHeaders } from './siteIdentity'

const clearSessionCookie = `${SITE_SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`

/** Logout must still work after pause/revocation, without an active D1 scope.
 * The native Payload UI posts to its usual API endpoint; the form endpoint
 * redirects only after the same central session revocation. */
export async function siteLogout(request: Request, service: SiteIdentityRPC, siteId: string, host: string, centralOrigin = CENTRAL_ORIGIN): Promise<Response | null> {
  requireCentralOrigin(centralOrigin)
  const url = new URL(request.url)
  const api = url.pathname === '/api/users/logout'
  if (!api && url.pathname !== SITE_LOGOUT_PATH) return null
  try {
    assertAdminHost(siteId, host)
    if (url.origin !== `https://${host}` || url.search) return privateResponse('Not found', 404)
    if (request.method !== 'POST') return privateResponse('Method not allowed', 405, { allow: 'POST' })
    assertSiteWriteOrigin(request.method, request.headers, host)
  } catch { return privateResponse('Access denied', 403) }
  try {
    const session = siteSessionFromHeaders(request.headers)
    if (session) await callSiteIdentity(() => service.logout(session, siteId, host))
    return api ? privateResponse(JSON.stringify({ message: 'Logged out successfully.' }), 200,
      { 'content-type': 'application/json', 'set-cookie': clearSessionCookie }) :
      privateResponse(null, 303, { location: centralOrigin, 'set-cookie': clearSessionCookie })
  } catch (error) {
    const denied = error instanceof SiteAccessDeniedError
    return privateResponse(denied ? 'Access denied' : 'Identity service unavailable', denied ? 403 : 503,
      { 'set-cookie': clearSessionCookie })
  }
}

/** Called inside trusted site ingress BEFORE Next/Payload. Returns null for
 * other routes; ordinary admin writes must also call assertSiteWriteOrigin.
 */
export async function siteSessionGateway(request: Request, service: SiteIdentityRPC, centralOrigin = CENTRAL_ORIGIN): Promise<Response | null> {
  requireCentralOrigin(centralOrigin)
  const url = new URL(request.url)
  if (url.pathname !== SITE_LOGIN_PATH && url.pathname !== SITE_LOGOUT_PATH) return null
  const context = requireSiteContext()
  if (url.pathname === SITE_LOGOUT_PATH) return siteLogout(request, service, context.siteId, context.requestHost ?? '', centralOrigin)
  try {
    assertAdminHost(context.siteId, context.requestHost ?? '')
    if (url.origin !== `https://${context.requestHost}` || url.search) return privateResponse('Not found', 404)
  } catch { return privateResponse('Not found', 404) }
  if (request.method !== 'POST') return privateResponse('Method not allowed', 405, { allow: 'POST' })
  if (request.headers.get('origin') !== centralOrigin) return privateResponse('Access denied', 403)
  try {
    let ticket: string
    try { ticket = await readSessionForm(request, 'ticket') } catch { return privateResponse('Invalid request', 400) }
    if (!/^[0-9a-f]{64}$/.test(ticket)) return privateResponse('Invalid request', 400)
    const session = await callSiteIdentity(() => service.redeem(ticket, context.siteId, context.requestHost!))
    requireSiteContext()
    const now = Date.now()
    if (!session || !/^[0-9a-f]{64}$/.test(session.session) || !Number.isSafeInteger(session.expiresAt) ||
      session.expiresAt <= now || session.expiresAt > now + 8 * 60 * 60_000) throw new Error('Invalid session response')
    const cookie = `${SITE_SESSION_COOKIE}=${session.session}; Path=/; Max-Age=${Math.floor((session.expiresAt - now) / 1000)}; Secure; HttpOnly; SameSite=Strict`
    return privateResponse(null, 303, { location: '/admin', 'set-cookie': cookie })
  } catch (error) {
    const denied = error instanceof SiteAccessDeniedError
    return privateResponse(denied ? 'Access denied' : 'Identity service unavailable', denied ? 403 : 503)
  }
}
