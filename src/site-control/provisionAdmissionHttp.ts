import { CENTRAL_ORIGIN,privateResponse,requireCentralOrigin } from './sessionHttp'
import { SiteManagementError,type CentralIdentity } from './siteLifecycle'
import { readManagementInput } from './siteManagementHttp'
import { cancelProvisionAdmission,listProvisionAdmissions,provisionAdmissionChoices,readProvisionAdmission,submitProvisionAdmission } from './provisionAdmission'

const number = (value: string | null) => {
  if (!value || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new SiteManagementError(400,'Explicit selection required')
  return Number(value)
}
export async function centralProvisionAdmission(request: Request,options: {
  centralOrigin?: string; database: D1Database; authenticate: (request: Request) => Promise<CentralIdentity | null>
}): Promise<Response> {
  const origin = requireCentralOrigin(options.centralOrigin ?? CENTRAL_ORIGIN),url = new URL(request.url)
  const allowed: Record<string,string[]> = { '/auth/site-requests': ['GET'],'/auth/site-request': ['GET','POST'],
    '/auth/site-request-cancel': ['POST'],'/auth/site-provision-options': ['GET'] }
  const methods = allowed[url.pathname]
  if (url.origin !== origin || !methods) return privateResponse('Not found',404)
  if (!methods.includes(request.method)) return privateResponse('Method not allowed',405,{ allow: methods.join(', ') })
  const write = request.method === 'POST'
  if ((write || request.headers.has('origin')) && request.headers.get('origin') !== origin) return privateResponse('Access denied',403)
  try {
    const keys = [...url.searchParams.keys()],kind = url.searchParams.get('kind')
    const accepted = write ? [] : url.pathname === '/auth/site-request' ? ['requestId'] :
      url.pathname === '/auth/site-requests' ? ['tenantId','after'] : kind === 'tenants' ? ['kind','after'] : ['kind','tenantId','after']
    if (keys.some(key => !accepted.includes(key) || url.searchParams.getAll(key).length !== 1)) throw new SiteManagementError(400,'Invalid query')
    const identity = await options.authenticate(request)
    if (!identity) return privateResponse('Central login required',401)
    const db = options.database
    let result: unknown
    if (write) {
      const input = await readManagementInput(request)
      if (url.pathname === '/auth/site-request') result = await submitProvisionAdmission(db,identity,input)
      else {
        if (!input || typeof input !== 'object' || Object.keys(input).join(',') !== 'requestId' || typeof (input as { requestId?: unknown }).requestId !== 'string') throw new SiteManagementError(400,'Explicit request ID required')
        result = await cancelProvisionAdmission(db,identity,(input as { requestId: string }).requestId)
      }
    } else if (url.pathname === '/auth/site-request') result = await readProvisionAdmission(db,identity,url.searchParams.get('requestId') ?? '')
    else if (url.pathname === '/auth/site-requests') result = await listProvisionAdmissions(db,identity,number(url.searchParams.get('tenantId')),url.searchParams.get('after') ?? '')
    else {
      if (kind !== 'tenants' && kind !== 'owners') throw new SiteManagementError(400,'Explicit choice kind required')
      const after = url.searchParams.get('after')
      result = await provisionAdmissionChoices(db,identity,kind,kind === 'owners' ? number(url.searchParams.get('tenantId')) : undefined,after ? number(after) : 0)
    }
    return privateResponse(JSON.stringify(result),200,{ 'content-type': 'application/json' })
  } catch (error) {
    return privateResponse(error instanceof SiteManagementError ? error.message : 'Provision request unavailable',error instanceof SiteManagementError ? error.status : 503)
  }
}
