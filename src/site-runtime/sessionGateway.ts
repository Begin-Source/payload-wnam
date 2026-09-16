import type { SiteIdentityRPC } from '../site-control/identityService'
import { CENTRAL_ORIGIN, SITE_LOGIN_PATH, SITE_LOGOUT_PATH, privateResponse, readSessionForm } from '../site-control/sessionHttp'
import { assertAdminHost } from '../site-control/registry'
import { SITE_SESSION_COOKIE, SiteAccessDeniedError } from '../site-control/sso'
import { requireSiteContext } from './context'
import { callSiteIdentity } from './identityClient'
import { assertSiteWriteOrigin, siteSessionFromHeaders } from './siteIdentity'

const clearSessionCookie = `${SITE_SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`

/** Called inside trusted site ingress BEFORE Next/Payload. Returns null for
 * other routes; ordinary admin writes must also call assertSiteWriteOrigin.
 */
export async function siteSessionGateway(request: Request, service: SiteIdentityRPC): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== SITE_LOGIN_PATH && url.pathname !== SITE_LOGOUT_PATH) return null
  const context = requireSiteContext()
  try {
    assertAdminHost(context.siteId, context.requestHost ?? '')
    if (url.origin !== `https://${context.requestHost}` || url.search) return privateResponse('Not found', 404)
  } catch { return privateResponse('Not found', 404) }
  if (request.method !== 'POST') return privateResponse('Method not allowed', 405, { allow: 'POST' })
  const login = url.pathname === SITE_LOGIN_PATH
  try {
    if (login) {
      if (request.headers.get('origin') !== CENTRAL_ORIGIN) return privateResponse('Access denied', 403)
    } else { assertSiteWriteOrigin(request.method, request.headers, context.requestHost!) }
  } catch { return privateResponse('Access denied', 403) }
  try {
    if (login) {
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
    }
    const session = siteSessionFromHeaders(request.headers)
    if (session) await callSiteIdentity(() => service.logout(session, context.siteId, context.requestHost!))
    return privateResponse(null, 303, { location: CENTRAL_ORIGIN, 'set-cookie': clearSessionCookie })
  } catch (error) {
    const denied = error instanceof SiteAccessDeniedError
    // Even when central is unavailable, discard the local browser credential.
    return privateResponse(denied ? 'Access denied' : 'Identity service unavailable', denied ? 403 : 503,
      login ? {} : { 'set-cookie': clearSessionCookie })
  }
}
