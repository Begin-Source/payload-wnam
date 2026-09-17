import { CENTRAL_ORIGIN, privateResponse, requireCentralOrigin } from './sessionHttp'
import { changeSiteLifecycle, getManagedSite, SiteManagementError, type CentralIdentity } from './siteLifecycle'

/** Bounded JSON read without trusting Content-Length. No credentials or target
 * selection are accepted from forwarded headers, URL defaults or body user IDs. */
async function readInput(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new SiteManagementError(400,'JSON required')
  const reader = request.body?.getReader()
  if (!reader) throw new SiteManagementError(400,'Request body required')
  const bytes = new Uint8Array(2048)
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (length + chunk.value.byteLength > bytes.length) { await reader.cancel(); throw new Error('Too large') }
      bytes.set(chunk.value,length); length += chunk.value.byteLength
    }
    return JSON.parse(new TextDecoder('utf-8',{ fatal: true }).decode(bytes.subarray(0,length)))
  } catch { throw new SiteManagementError(400,'Invalid request body') }
  finally { reader.releaseLock() }
}

export async function centralSiteManagement(request: Request, options: {
  centralOrigin?: string; database: D1Database; authenticate: (request: Request) => Promise<CentralIdentity | null>
}): Promise<Response> {
  const origin = requireCentralOrigin(options.centralOrigin ?? CENTRAL_ORIGIN), url = new URL(request.url)
  if (url.origin !== origin || !['/auth/site','/auth/site-lifecycle'].includes(url.pathname)) return privateResponse('Not found',404)
  const write = url.pathname === '/auth/site-lifecycle', method = write ? 'POST' : 'GET'
  if (request.method !== method) return privateResponse('Method not allowed',405,{ allow: method })
  if ((write && request.headers.get('origin') !== origin) || (!write && request.headers.has('origin') && request.headers.get('origin') !== origin)) return privateResponse('Access denied',403)
  try {
    if (write ? Boolean(url.search) : [...url.searchParams.keys()].join(',') !== 'siteId') throw new SiteManagementError(400,'Explicit siteId required')
    const input = write ? await readInput(request) : url.searchParams.get('siteId')!
    const identity = await options.authenticate(request)
    if (!identity) return privateResponse('Central login required',401)
    const result = write ? await changeSiteLifecycle(options.database,identity,input) : await getManagedSite(options.database,identity,input as string)
    return privateResponse(JSON.stringify(result),200,{ 'content-type': 'application/json' })
  } catch (error) {
    return privateResponse(error instanceof SiteManagementError ? error.message : 'Site management unavailable',error instanceof SiteManagementError ? error.status : 503)
  }
}
