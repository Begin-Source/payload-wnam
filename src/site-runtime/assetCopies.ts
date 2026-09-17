import type { PayloadRequest } from 'payload'
import { canonicalMasterJSON } from '../site-control/masterSnapshot'
import { assertAssetReference, assetArchiveKey, assetFilename, assetReference, assetSnapshotJSON, verifyAssetBytes, verifyAssetRelease,
  type AssetReference, type AssetTransfer } from '../site-control/assetSnapshot'
import { masterOperationContext, assertMasterOperationId } from './masterCopies'
import { createSiteR2Proxy } from './r2'

export type AssetDeliveryCapability = { readAsset: (siteId: string, routingVersion: number, ref: AssetReference) => Promise<AssetTransfer> }
export type SiteAssetBuckets = { publicBucket: R2Bucket; privateBucket: R2Bucket }
function buckets(storage: SiteAssetBuckets) {
  if (storage.publicBucket === storage.privateBucket) throw new Error('Separate public and private asset buckets required')
  return { public: createSiteR2Proxy(storage.publicBucket,{ assetWrites: true }),private: createSiteR2Proxy(storage.privateBucket,{ assetWrites: true }) }
}
async function begin(req: PayloadRequest, reference: AssetReference, id: string, cap: AssetDeliveryCapability, kind: 'copy' | 'withdraw') {
  assertAssetReference(reference); assertMasterOperationId(id)
  const ref = JSON.parse(canonicalMasterJSON(reference)) as AssetReference
  const ctx = await masterOperationContext(req),{ database: db,context,tenant,localSiteId,ownership,user } = ctx
  const transfer = await cap.readAsset(context.siteId,context.routingVersion,ref)
  const release = await verifyAssetRelease(transfer.release)
  if (transfer.siteId !== context.siteId || transfer.localSiteId !== localSiteId || transfer.routingVersion !== context.routingVersion ||
    String(transfer.centralTenantId) !== tenant.centralTenantId || (release.tenantId !== 0 && String(release.tenantId) !== tenant.centralTenantId) ||
    canonicalMasterJSON(assetReference(release)) !== canonicalMasterJSON(ref)) throw new Error('Asset destination or scope mismatch')
  const withdrawal = transfer.withdrawal
  if (withdrawal) {
    assertMasterOperationId(withdrawal.operationId)
    if (canonicalMasterJSON({ recordId: withdrawal.recordId,revision: withdrawal.revision,digest: withdrawal.digest }) !== canonicalMasterJSON(ref) ||
      new Date(withdrawal.withdrawnAt).toISOString() !== withdrawal.withdrawnAt || typeof withdrawal.reason !== 'string' || !withdrawal.reason.trim() ||
      withdrawal.reason.length > 500) throw new Error('Invalid asset withdrawal')
  }
  if (kind === 'copy' ? Boolean(withdrawal) : !withdrawal) throw new Error('Asset withdrawal state prevents operation')
  const json = canonicalMasterJSON({ kind,siteId: context.siteId,actor: user.centralUserId,ref,withdrawal })
  await db.batch([
    db.prepare(`INSERT INTO site_asset_releases(record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
      SELECT ?,?,?,?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`)
      .bind(ref.recordId,ref.revision,release.tenantId,ref.digest,assetSnapshotJSON(release),release.operationId,release.createdAt),
    db.prepare(`INSERT INTO site_asset_operations(operation_id,request_json,kind,created_at) SELECT ?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`)
      .bind(id,json,kind,new Date().toISOString()),
  ])
  const receipt = await db.prepare('SELECT request_json FROM site_asset_operations WHERE operation_id=?').bind(id).first<string>('request_json')
  if (receipt !== json) throw new Error('Asset operation or tenant mapping conflict')
  return { ...ctx,ref,release,withdrawal,bytes: transfer.bytes,json }
}
export function assetCopySQL(ref: AssetReference): string {
  assertAssetReference(ref)
  return `SELECT c.local_id FROM site_asset_copies c WHERE c.record_id='${ref.recordId}' AND c.revision=${ref.revision} AND c.digest='${ref.digest}'
    AND NOT EXISTS(SELECT 1 FROM site_asset_withdrawals w WHERE w.record_id=c.record_id AND w.revision=c.revision)`
}
export async function requireAssetCopy(req: PayloadRequest, ref: AssetReference): Promise<number> {
  const { database,localSiteId,tenant } = await masterOperationContext(req)
  const id = await database.prepare(`SELECT m.id FROM media m WHERE m.id=(${assetCopySQL(ref)}) AND m.site_id=? AND m.tenant_id=?`)
    .bind(localSiteId,tenant.localTenantId).first<number>('id')
  if (!id) throw new Error('Required asset copy unavailable or withdrawn')
  return id
}
/** R2 is not in the D1 transaction. Pending receipts allow exact retries. */
export async function copyAssetToSite(req: PayloadRequest, ref: AssetReference, operationId: string, cap: AssetDeliveryCapability, storage: SiteAssetBuckets): Promise<number> {
  const { database: db,release,bytes,json,localSiteId,tenant,user,ownership } = await begin(req,ref,operationId,cap,'copy')
  if (!bytes) throw new Error('Asset bytes unavailable')
  await verifyAssetBytes(release,bytes)
  const live = `NOT EXISTS(SELECT 1 FROM site_asset_withdrawals WHERE record_id='${release.recordId}' AND revision=${release.revision})`
  if (!await db.prepare(`SELECT 1 AS live WHERE ${live}`).first('live')) throw new Error('Asset withdrawn')
  const scoped = buckets(storage),key = assetArchiveKey(release)
  for (const [bucket,cacheControl] of [[scoped.private,'private, no-store'],[scoped.public,'public, max-age=300']] as const) {
    await bucket.put(key,bytes,{ onlyIf: { etagDoesNotMatch: '*' },sha256: release.sha256,
      customMetadata: { assetDigest: release.digest },httpMetadata: { contentType: release.mimeType,cacheControl } })
    const object = await bucket.get(key)
    if (!object) throw new Error('Asset object unavailable or withdrawn')
    await verifyAssetBytes(release,new Uint8Array(await object.arrayBuffer()))
  }
  const at = new Date().toISOString(),filename = assetFilename(release)
  const pending = 'EXISTS(SELECT 1 FROM site_asset_operations WHERE operation_id=? AND request_json=? AND committed=0)'
  await db.batch([
    db.prepare(`INSERT INTO site_asset_copies(record_id,revision,digest,local_id,filename,created_at)
      SELECT ?,?,?,MAX(COALESCE((SELECT MAX(id) FROM media),0),(SELECT high_id FROM site_asset_id_watermark WHERE singleton=1))+1,?,?
      WHERE ${ownership} AND ${live} AND ${pending} ON CONFLICT DO NOTHING`).bind(release.recordId,release.revision,release.digest,filename,at,operationId,json),
    db.prepare(`INSERT INTO media(id,alt,site_id,tenant_id,filename,prefix,mime_type,filesize,width,height,created_by_id,
      central_source_record_id,central_source_revision,central_source_synced_at,created_at,updated_at)
      SELECT c.local_id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM site_asset_copies c WHERE c.record_id=? AND c.revision=? AND c.digest=?
      AND ${ownership} AND ${live} AND ${pending} AND NOT EXISTS(SELECT 1 FROM media WHERE id=c.local_id)`)
      .bind(release.alt,localSiteId,tenant.localTenantId,filename,'master-assets',release.mimeType,release.size,release.width,release.height,user.id,
        release.recordId,release.revision,at,at,at,release.recordId,release.revision,release.digest,operationId,json),
    db.prepare(`UPDATE site_asset_operations SET committed=CASE WHEN ${ownership} AND ${live} AND EXISTS(SELECT 1 FROM media m
      WHERE m.id=(${assetCopySQL(assetReference(release))}) AND m.site_id=? AND m.tenant_id=?) THEN 1 ELSE -1 END
      WHERE operation_id=? AND request_json=? AND committed=0`).bind(localSiteId,tenant.localTenantId,operationId,json),
  ])
  const committed = await db.prepare('SELECT committed FROM site_asset_operations WHERE operation_id=? AND request_json=?').bind(operationId,json).first('committed')
  if (committed !== 1) throw new Error('Asset copy not committed')
  req.payloadDataLoader?.clearAll()
  return requireAssetCopy(req,assetReference(release))
}
/** Persist withdrawal before touching R2. Empty permanent tombstones prevent a
 * delayed create-only copy from resurrecting bytes after withdrawal. */
export async function synchronizeAssetWithdrawal(req: PayloadRequest, ref: AssetReference, operationId: string, cap: AssetDeliveryCapability, storage: SiteAssetBuckets): Promise<void> {
  const { database: db,release,withdrawal,json,ownership } = await begin(req,ref,operationId,cap,'withdraw')
  await db.prepare(`INSERT INTO site_asset_withdrawals(record_id,revision,digest,operation_id,withdrawn_at,reason)
    SELECT ?,?,?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`)
    .bind(release.recordId,release.revision,release.digest,withdrawal!.operationId,withdrawal!.withdrawnAt,withdrawal!.reason).run()
  const saved = await db.prepare('SELECT digest FROM site_asset_withdrawals WHERE record_id=? AND revision=?').bind(release.recordId,release.revision).first('digest')
  if (saved !== release.digest) throw new Error('Asset withdrawal tenant mapping changed')
  const scoped = buckets(storage)
  for (const bucket of [scoped.public,scoped.private]) await bucket.put(assetArchiveKey(release),new Uint8Array(),{
    customMetadata: { assetWithdrawn: '1',assetDigest: release.digest },httpMetadata: { contentType: 'application/octet-stream',cacheControl: 'private, no-store' } })
  await db.prepare(`UPDATE site_asset_operations SET committed=1 WHERE operation_id=? AND request_json=? AND ${ownership}`).bind(operationId,json).run()
  if (await db.prepare('SELECT committed FROM site_asset_operations WHERE operation_id=? AND request_json=?').bind(operationId,json).first('committed') !== 1) throw new Error('Asset withdrawal not committed')
  req.payloadDataLoader?.clearAll()
}
