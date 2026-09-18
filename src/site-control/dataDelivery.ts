import { SiteAccessDeniedError, SiteLoginBroker, type SitePrincipal } from './sso'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import { optionalSiteContext } from '../site-runtime/context'
import { assertMasterReference, canonicalMasterJSON, type MasterBundle, type MasterReference } from './masterSnapshot'
import { assertConfigReference, type ConfigBundle, type ConfigReference } from './configSnapshot'
import { assertAssetReference, type AssetReference, type AssetTransfer } from './assetSnapshot'
import { exportMasterBundle } from './masterPublisher'
import { exportConfigBundle } from './configPublisher'
import { exportAssetTransfer } from './assetPublisher'
import { acknowledgeMachineDataDelivery, readMachineDataDelivery, recordMachineDeliveryFailure,
  type DataDeliveryReceipt, type DataDeliverySummary, type MachineDataDelivery } from './dataDeliveryJournal'

export type DataDeliveryAuth = { session: string; siteId: string; adminHost: string; routingVersion: number }
export type DataDeliveryResult<T> = { ok: true; principal: SitePrincipal; value: T } | { ok: false; reason: 'denied' | 'unavailable' }
export type MachineDataDeliveryResult<T> = { ok: true; value: T } | { ok: false; reason: 'denied' | 'unavailable' }
export interface SiteDataRPC {
  readMaster(auth: DataDeliveryAuth, ref: MasterReference): Promise<DataDeliveryResult<MasterBundle>>
  readConfig(auth: DataDeliveryAuth, ref: ConfigReference): Promise<DataDeliveryResult<ConfigBundle>>
  readAsset(auth: DataDeliveryAuth, ref: AssetReference): Promise<DataDeliveryResult<AssetTransfer>>
  readDelivery?(operationId: string, capability: string): Promise<MachineDataDeliveryResult<MachineDataDelivery>>
  acknowledgeDelivery?(operationId: string, capability: string, receipt: DataDeliveryReceipt): Promise<MachineDataDeliveryResult<DataDeliverySummary>>
  failDelivery?(operationId: string, capability: string, errorCode: string): Promise<MachineDataDeliveryResult<DataDeliverySummary>>
}

/** Machine methods are available only through the private service binding. The
 * capability is single-operation material delivered to a target group queue;
 * failures never include central SQL, storage or credential details. */
export function createMachineDataDelivery(db: D1Database, archive: R2Bucket) {
  const run = async <T>(action: () => Promise<T>): Promise<MachineDataDeliveryResult<T>> => {
    try {
      if (optionalSiteContext()) throw new Error('Central data service inside site request')
      return { ok: true,value: await action() }
    } catch { return { ok: false,reason: 'unavailable' } }
  }
  return Object.freeze({
    readDelivery: (operationId: string, capability: string) => run(() => readMachineDataDelivery(db,archive,operationId,capability)),
    acknowledgeDelivery: (operationId: string, capability: string, receipt: DataDeliveryReceipt) =>
      run(() => acknowledgeMachineDataDelivery(db,operationId,capability,receipt)),
    failDelivery: (operationId: string, capability: string, errorCode: string) =>
      run(() => recordMachineDeliveryFailure(db,operationId,capability,errorCode)),
  })
}

/** Central-only read capability. Every request checks the original live central
 * session and current manager grant, including again after asynchronous export.
 * No caller-supplied principal, default site, credentials or SQL in responses. */
export function createDataDelivery(db: D1Database, archive: R2Bucket): SiteDataRPC {
  const broker = new SiteLoginBroker(db,payloadSessionAuthority(db))
  async function run<T>(input: DataDeliveryAuth, action: (auth: DataDeliveryAuth) => Promise<T>): Promise<DataDeliveryResult<T>> {
    try {
      if (optionalSiteContext()) throw new Error('Central data service inside site request')
      if (!input || Object.keys(input).sort().join(',') !== 'adminHost,routingVersion,session,siteId' ||
        typeof input.session !== 'string' || !/^[0-9a-f]{64}$/.test(input.session) ||
        !Number.isSafeInteger(input.routingVersion) || input.routingVersion < 1) throw new SiteAccessDeniedError('Invalid data identity')
      const auth = { ...input }
      const principal = await broker.authenticate(auth.session,auth.siteId,auth.adminHost)
      if (principal.role !== 'manager' || principal.routingVersion !== auth.routingVersion) throw new SiteAccessDeniedError('Data manager access required')
      const value = await action(auth)
      const current = await broker.authenticate(auth.session,auth.siteId,auth.adminHost)
      if (current.role !== 'manager' || current.userId !== principal.userId || current.localSiteId !== principal.localSiteId ||
        current.routingVersion !== principal.routingVersion) throw new SiteAccessDeniedError('Data permission changed')
      return { ok: true,principal: current,value }
    } catch (error) {
      return { ok: false,reason: error instanceof SiteAccessDeniedError ? 'denied' : 'unavailable' }
    }
  }
  // Snapshot references synchronously before the first await. Validation errors
  // also use the bounded response shape; no raw exception crosses RPC.
  function pinned<T>(ref: T, validate: (ref: T) => void): T {
    try { validate(ref); return JSON.parse(canonicalMasterJSON(ref)) as T }
    catch { throw new SiteAccessDeniedError('Invalid data reference') }
  }
  return Object.freeze({
    readMaster: (auth: DataDeliveryAuth, ref: MasterReference) => {
      let root: MasterReference
      try { root = pinned(ref,assertMasterReference) } catch { return Promise.resolve({ ok: false,reason: 'denied' } as const) }
      return run(auth,input => exportMasterBundle(db,input.siteId,input.routingVersion,root))
    },
    readConfig: (auth: DataDeliveryAuth, ref: ConfigReference) => {
      let root: ConfigReference
      try { root = pinned(ref,assertConfigReference) } catch { return Promise.resolve({ ok: false,reason: 'denied' } as const) }
      return run(auth,input => exportConfigBundle(db,input.siteId,input.routingVersion,root))
    },
    readAsset: (auth: DataDeliveryAuth, ref: AssetReference) => {
      let root: AssetReference
      try { root = pinned(ref,assertAssetReference) } catch { return Promise.resolve({ ok: false,reason: 'denied' } as const) }
      return run(auth,input => exportAssetTransfer(db,archive,input.siteId,input.routingVersion,root))
    },
  })
}
