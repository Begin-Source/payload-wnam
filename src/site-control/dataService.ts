import { WorkerEntrypoint } from 'cloudflare:workers'
import { createDataDelivery, createMachineDataDelivery, type DataDeliveryAuth, type SiteDataRPC } from './dataDelivery'
import type { MasterReference } from './masterSnapshot'
import type { ConfigReference } from './configSnapshot'
import type { AssetReference } from './assetSnapshot'
import type { DataDeliveryReceipt } from './dataDeliveryJournal'

/** Dedicated service binding, with a private archive binding. No HTTP download,
 * publisher, login issuer, arbitrary query or account-management capability. */
export class SiteDataService extends WorkerEntrypoint<{ CENTRAL_D1: D1Database; MASTER_ASSET_ARCHIVE: R2Bucket }> implements SiteDataRPC {
  fetch(): Response { return new Response('Not found',{ status: 404 }) }
  readMaster(auth: DataDeliveryAuth, ref: MasterReference) {
    return createDataDelivery(this.env.CENTRAL_D1,this.env.MASTER_ASSET_ARCHIVE).readMaster(auth,ref)
  }
  readConfig(auth: DataDeliveryAuth, ref: ConfigReference) {
    return createDataDelivery(this.env.CENTRAL_D1,this.env.MASTER_ASSET_ARCHIVE).readConfig(auth,ref)
  }
  readAsset(auth: DataDeliveryAuth, ref: AssetReference) {
    return createDataDelivery(this.env.CENTRAL_D1,this.env.MASTER_ASSET_ARCHIVE).readAsset(auth,ref)
  }
  readDelivery(operationId: string, capability: string) {
    return createMachineDataDelivery(this.env.CENTRAL_D1,this.env.MASTER_ASSET_ARCHIVE).readDelivery(operationId,capability)
  }
  acknowledgeDelivery(operationId: string, capability: string, receipt: DataDeliveryReceipt) {
    return createMachineDataDelivery(this.env.CENTRAL_D1,this.env.MASTER_ASSET_ARCHIVE).acknowledgeDelivery(operationId,capability,receipt)
  }
  failDelivery(operationId: string, capability: string, errorCode: string) {
    return createMachineDataDelivery(this.env.CENTRAL_D1,this.env.MASTER_ASSET_ARCHIVE).failDelivery(operationId,capability,errorCode)
  }
}
