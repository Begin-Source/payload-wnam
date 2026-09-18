import { CENTRAL_ORIGIN,privateResponse,requireCentralOrigin } from './sessionHttp'
import { readManagementInput } from './siteManagementHttp'
import { readDataDelivery } from './dataDeliveryJournal'
import { requestQueuedDataDelivery,type DataDeliveryQueueMessage } from './dataDeliveryQueue'
import { SiteManagementError,type CentralIdentity } from './siteLifecycle'

export async function centralDataDelivery(request: Request,options: {
  centralOrigin?: string
  database: D1Database
  archive: R2Bucket
  queue: Queue<DataDeliveryQueueMessage>
  secret: string
  authenticate: (request: Request) => Promise<CentralIdentity | null>
}): Promise<Response> {
  const origin = requireCentralOrigin(options.centralOrigin ?? CENTRAL_ORIGIN),url = new URL(request.url)
  if (url.origin !== origin || url.pathname !== '/auth/site-data-delivery') return privateResponse('Not found',404)
  if (!['GET','POST'].includes(request.method)) return privateResponse('Method not allowed',405,{ allow: 'GET, POST' })
  const write = request.method === 'POST'
  if ((write || request.headers.has('origin')) && request.headers.get('origin') !== origin) return privateResponse('Access denied',403)
  try {
    const keys = [...url.searchParams.keys()]
    if (write ? Boolean(keys.length) : keys.length !== 1 || keys[0] !== 'operationId' || url.searchParams.getAll('operationId').length !== 1) {
      throw new SiteManagementError(400,'Explicit delivery operation required')
    }
    const identity = await options.authenticate(request)
    if (!identity) return privateResponse('Central login required',401)
    const result = write ? await requestQueuedDataDelivery(options.database,options.archive,options.queue,identity,
      await readManagementInput(request),options.secret) :
      await readDataDelivery(options.database,identity,url.searchParams.get('operationId') ?? '')
    return privateResponse(JSON.stringify(result),200,{ 'content-type': 'application/json' })
  } catch (error) {
    return privateResponse(error instanceof SiteManagementError ? error.message : 'Data delivery unavailable',
      error instanceof SiteManagementError ? error.status : 503)
  }
}
