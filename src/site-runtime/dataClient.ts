import type { PayloadRequest } from 'payload'
import type { DataDeliveryAuth, DataDeliveryResult, SiteDataRPC } from '../site-control/dataDelivery'
import type { MasterDeliveryCapability } from './masterReceiver'
import type { ConfigDeliveryCapability } from './configReceiver'
import type { AssetDeliveryCapability } from './assetCopies'
import { assertAdminHost } from '../site-control/registry'
import { SiteAccessDeniedError } from '../site-control/sso'
import { requireLocalSiteId, requireSiteContext } from './context'
import { assertSitePayloadRequest } from './payloadRequest'
import { authenticatedSiteUser, siteSessionFromHeaders } from './siteIdentity'

export class SiteDataUnavailableError extends Error {}

/** Interactive manager delivery. Only trusted Worker wiring supplies service;
 * scope comes from ingress and the credential from the host-only session cookie.
 * The returned capability cannot be reused by another request or site. */
export function siteDataClient(req: PayloadRequest, service: SiteDataRPC): MasterDeliveryCapability & ConfigDeliveryCapability & AssetDeliveryCapability {
  assertSitePayloadRequest(req)
  const context = requireSiteContext(),localSiteId = requireLocalSiteId(),user = authenticatedSiteUser(req.user)
  if (req.payload.config.custom.payloadRole !== 'site' || user?.siteRole !== 'manager') throw new SiteAccessDeniedError('Site data manager permission required')
  const host = context.requestHost ?? ''
  assertAdminHost(context.siteId,host)
  const session = siteSessionFromHeaders(req.headers)
  if (!session) throw new SiteAccessDeniedError('Site data session required')
  const actor = user.centralUserId
  function owner(siteId: string, routingVersion: number) {
    if (requireSiteContext().requestToken !== context.requestToken || requireLocalSiteId() !== localSiteId ||
      siteId !== context.siteId || routingVersion !== context.routingVersion) throw new SiteAccessDeniedError('Site data context mismatch')
    assertSitePayloadRequest(req)
  }
  async function call<T>(siteId: string, routingVersion: number, invoke: (auth: DataDeliveryAuth) => Promise<DataDeliveryResult<T>>): Promise<T> {
    owner(siteId,routingVersion)
    let result: DataDeliveryResult<T>
    try { result = await invoke({ session: session!,siteId: context.siteId,adminHost: host,routingVersion: context.routingVersion }) }
    catch { throw new SiteDataUnavailableError('Central data service unavailable') }
    owner(siteId,routingVersion)
    if (!result || typeof result.ok !== 'boolean') throw new SiteDataUnavailableError('Invalid central data response')
    if (!result.ok) {
      if (result.reason === 'denied') throw new SiteAccessDeniedError('Central data access denied')
      throw new SiteDataUnavailableError('Central data service unavailable')
    }
    const principal = result.principal
    if (!principal || principal.siteId !== context.siteId || principal.localSiteId !== localSiteId || principal.routingVersion !== context.routingVersion ||
      principal.userId !== actor || principal.role !== 'manager') throw new SiteDataUnavailableError('Central data identity mismatch')
    return result.value
  }
  const capability: MasterDeliveryCapability & ConfigDeliveryCapability & AssetDeliveryCapability = {
    readBundle: (siteId,routingVersion,ref) => call(siteId,routingVersion,auth => service.readMaster(auth,ref)),
    readConfig: (siteId,routingVersion,ref) => call(siteId,routingVersion,auth => service.readConfig(auth,ref)),
    readAsset: (siteId,routingVersion,ref) => call(siteId,routingVersion,auth => service.readAsset(auth,ref)),
  }
  return Object.freeze(capability)
}
