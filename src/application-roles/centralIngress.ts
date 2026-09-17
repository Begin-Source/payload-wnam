import { CENTRAL_ORIGIN, privateResponse } from '../site-control/sessionHttp'
import { requireCentralEnvironment, type CentralEnvironment } from './centralEnvironment'

/** Only the canonical central origin can reach the role's Next application.
 * Forwarded headers never select an origin, a role, or a database. */
export async function centralFetch<E extends CentralEnvironment>(request: Request, env: E, ctx: ExecutionContext,
  next: (request: Request, env: E, ctx: ExecutionContext) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url)
  if (url.origin !== CENTRAL_ORIGIN) return privateResponse('Unknown central host',421)
  try { requireCentralEnvironment(env) } catch { return privateResponse('Central service unavailable',503) }
  const headers = new Headers(request.headers)
  headers.set('host',url.host)
  headers.set('x-forwarded-host',url.host)
  headers.set('x-forwarded-proto','https')
  for (const name of ['forwarded','x-site-id','x-site-slug']) headers.delete(name)
  const response = await next(new Request(request,{ headers }),env,ctx)
  const outgoing = new Headers(response.headers)
  outgoing.set('cache-control','private, no-store')
  outgoing.set('x-robots-tag','noindex, nofollow')
  return new Response(response.body,{ status: response.status,statusText: response.statusText,headers: outgoing })
}
