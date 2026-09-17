import { privateResponse } from '../site-control/sessionHttp'
import { SiteAccessDeniedError } from '../site-control/sso'
import { bindSiteCallback, requireSiteContext, withSiteContext } from '../site-runtime/context'
import { siteIdentityAuthenticator } from '../site-runtime/identityClient'
import { siteLogout, siteSessionGateway } from '../site-runtime/sessionGateway'
import { assertSiteWriteOrigin, siteSessionFromHeaders } from '../site-runtime/siteIdentity'
import { requireSiteEnvironment, type SiteEnvironment } from './siteEnvironment'

type RouteState = { version: number; active: boolean; fingerprint: string }
// Bounded by the deployment manifest (at most 50), never arbitrary hostnames.
const versions = new WeakMap<SiteEnvironment, Map<string, RouteState>>()

/** Admin role only. Public routing/cache is a separate ingress; no anonymous
 * content API or runtime database fallback is mounted on a CMS hostname. */
export async function siteFetch<E extends SiteEnvironment>(request: Request, env: E, ctx: ExecutionContext,
  next: (request: Request, env: E, ctx: ExecutionContext) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url)
  const match = /^cms-site-([a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)\.beginos\.org$/.exec(url.hostname)
  if (url.protocol !== 'https:' || url.port || !match) return privateResponse('Unknown site host', 421)
  let routes
  try { routes = requireSiteEnvironment(env).routes } catch { return privateResponse('Site service unavailable', 503) }
  const binding = routes.find(route => route.siteId === match[1])
  if (!binding) return privateResponse('Unknown site host', 421)
  const logout = await siteLogout(request, env.IDENTITY, binding.siteId, url.hostname, env.CENTRAL_ORIGIN)
  if (logout) return logout
  let states = versions.get(env)
  if (!states) { states = new Map(); versions.set(env, states) }
  let state = states.get(binding.siteId)
  if (!state) { state = { version: 0, active: false, fingerprint: '' }; states.set(binding.siteId, state) }
  const current = state
  let route
  try {
    route = await env.ROUTING.resolve(binding.siteId, url.hostname, env.WORKER_GROUP)
    if (!route || route.siteId !== binding.siteId || route.adminHost !== url.hostname || route.workerGroup !== env.WORKER_GROUP ||
      route.databaseId !== binding.databaseId || route.bindingName !== binding.bindingName ||
      route.localSiteId !== binding.localSiteId || route.schemaVersion !== binding.schemaVersion ||
      !Number.isSafeInteger(route.routingVersion) || route.routingVersion < 1) throw new Error('Invalid route')
    const fingerprint = JSON.stringify([route.databaseId, route.bindingName, route.localSiteId, route.schemaVersion, route.migrationState])
    if (route.routingVersion < current.version || (route.routingVersion === current.version && current.fingerprint !== fingerprint)) {
      throw new Error('Stale or conflicting route')
    }
    current.version = route.routingVersion; current.fingerprint = fingerprint; current.active = route.migrationState === 'active'
  } catch { current.active = false; return privateResponse('Site routing unavailable', 503) }
  if (!current.active) return privateResponse('Site unavailable', 503)
  const routingVersion = route.routingVersion
  return withSiteContext({ siteId: binding.siteId, localSiteId: binding.localSiteId,
    binding: env[binding.bindingName as `SITE_D1_${string}`], requestHost: url.hostname, routingVersion,
    currentRoutingVersion: () => current.active ? current.version : -1, identity: null }, async () => {
    const gateway = await siteSessionGateway(request, env.IDENTITY, env.CENTRAL_ORIGIN)
    if (gateway) return gateway
    try { assertSiteWriteOrigin(request.method, request.headers, url.hostname) }
    catch { return privateResponse('Access denied', 403) }
    let session
    try { session = siteSessionFromHeaders(request.headers) } catch { return privateResponse('Invalid session', 401) }
    if (!session) return (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/admin'))) ?
      privateResponse(null, 303, { location: `${env.CENTRAL_ORIGIN}/admin` }) : privateResponse('Authentication required', 401)
    try { await siteIdentityAuthenticator(env.IDENTITY)(session, binding.siteId, url.hostname) }
    catch (error) { return privateResponse(error instanceof SiteAccessDeniedError ? 'Access denied' : 'Identity service unavailable', error instanceof SiteAccessDeniedError ? 403 : 503) }
    requireSiteContext()
    const headers = new Headers(request.headers)
    headers.set('host', url.host); headers.set('x-forwarded-host', url.host); headers.set('x-forwarded-proto', 'https')
    for (const name of ['forwarded', 'x-site-id', 'x-site-slug']) headers.delete(name)
    const response = await next(new Request(request, { headers }), env, ctx)
    requireSiteContext()
    const reader = response.body?.getReader()
    const body = reader ? new ReadableStream<Uint8Array>({
      pull: bindSiteCallback(async controller => {
        const result = await reader.read()
        if (result.done) controller.close()
        else controller.enqueue(result.value)
      }),
      cancel: bindSiteCallback(reason => reader.cancel(reason)),
    }) : null
    const outgoing = new Headers(response.headers)
    outgoing.set('cache-control', 'private, no-store'); outgoing.set('x-robots-tag', 'noindex, nofollow')
    return new Response(body, { status: response.status, statusText: response.statusText, headers: outgoing })
  })
}
