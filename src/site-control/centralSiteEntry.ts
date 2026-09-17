import type { Payload } from 'payload'
import { assertSiteId } from './registry'
import { SiteAccessDeniedError, type SiteLoginBroker } from './sso'
import { CENTRAL_ORIGIN, requireCentralOrigin, CENTRAL_SITE_ENTRY_PATH, SITE_LOGIN_PATH, privateResponse, readSessionForm } from './sessionHttp'

/** Only accept a JWT-verified original Payload session, never API keys, auto-login
 * or user/session IDs from an HTTP body. Broker rechecks that live session in D1.
 */
export async function centralIdentityFromPayload(payload: Payload, request: Request) {
  const headers = new Headers(request.headers)
  headers.set('DisableAutologin', 'true')
  const { user } = await payload.auth({ headers })
  const identity = user as { collection?: string; _strategy?: string; id?: unknown; _sid?: unknown } | null
  if (identity?.collection !== 'users' || identity._strategy !== 'local-jwt' ||
    !Number.isSafeInteger(identity.id) || Number(identity.id) < 1 ||
    typeof identity._sid !== 'string' || !identity._sid || identity._sid.length > 128) return null
  return { userId: String(identity.id), sessionId: identity._sid }
}

/** Mount only on the central role. Authentication callback must call the central
 * Payload instance; injectable here so this transport owns no global config.
 */
export async function centralSiteEntry(request: Request, options: {
  centralOrigin?: string
  broker: Pick<SiteLoginBroker, 'issueTicket'>
  authenticate: (request: Request) => Promise<{ userId: string; sessionId: string } | null>
}): Promise<Response> {
  const centralOrigin = requireCentralOrigin(options.centralOrigin ?? CENTRAL_ORIGIN)
  const url = new URL(request.url)
  if (url.origin !== centralOrigin || url.pathname !== CENTRAL_SITE_ENTRY_PATH || url.search) return privateResponse('Not found', 404)
  if (request.method !== 'POST') return privateResponse('Method not allowed', 405, { allow: 'POST' })
  if (request.headers.get('origin') !== centralOrigin) return privateResponse('Access denied', 403)
  let siteId: string
  try { siteId = await readSessionForm(request, 'siteId'); assertSiteId(siteId) } catch { return privateResponse('Invalid request', 400) }
  try {
    const identity = await options.authenticate(request)
    if (!identity) return privateResponse('Central login required', 401)
    const issued = await options.broker.issueTicket(siteId, identity)
    // Host is canonical and ticket hex, but validate before inserting either into HTML.
    if (issued.adminOrigin !== `https://cms-site-${siteId}.beginos.org` || !/^[0-9a-f]{64}$/.test(issued.ticket)) throw new Error('Invalid ticket response')
    const nonce = crypto.randomUUID().replaceAll('-', '')
    const action = `${issued.adminOrigin}${SITE_LOGIN_PATH}`
    const response = privateResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Opening site admin</title></head><body><form method="post" action="${action}"><input type="hidden" name="ticket" value="${issued.ticket}"><button type="submit">Continue to site admin</button></form><script nonce="${nonce}">document.forms[0].submit()</script></body></html>`, 200, { 'content-type': 'text/html; charset=utf-8' })
    // no-referrer makes navigation POSTs carry Origin:null in Chromium.
    // Send only the origin (never path/query); keep exact Origin validation.
    response.headers.set('referrer-policy', 'strict-origin')
    response.headers.set('content-security-policy', `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${issued.adminOrigin}; base-uri 'none'; frame-ancestors 'none'`)
    return response
  } catch (error) {
    return privateResponse(error instanceof SiteAccessDeniedError ? 'Access denied' : 'Identity service unavailable', error instanceof SiteAccessDeniedError ? 403 : 503)
  }
}
