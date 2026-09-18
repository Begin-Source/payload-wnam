import { canonicalMasterJSON } from '../site-control/masterSnapshot'
import { assertAssetReference, assetArchiveKey, assetReference, assetSnapshotJSON, verifyAssetBytes, verifyAssetRelease,
  type AssetReference, type AssetRelease, type AssetTransfer, type AssetWithdrawal } from '../site-control/assetSnapshot'
import { createSiteD1Proxy } from './d1'
import { requireLocalSiteId, requireSiteContext } from './context'

export type AssetCandidateStorage = { publicBucket: R2Bucket; privateBucket: R2Bucket }

function validateWithdrawal(value: AssetWithdrawal | null,ref: AssetReference): AssetWithdrawal | null {
  if (!value) return null
  if (canonicalMasterJSON({ recordId: value.recordId,revision: value.revision,digest: value.digest }) !== canonicalMasterJSON(ref) ||
    typeof value.operationId !== 'string' || !value.operationId || value.operationId.length > 128 ||
    new Date(value.withdrawnAt).toISOString() !== value.withdrawnAt || typeof value.reason !== 'string' ||
    !value.reason.trim() || value.reason.length > 500) throw new Error('Invalid asset withdrawal')
  return JSON.parse(canonicalMasterJSON(value)) as AssetWithdrawal
}

function objectKey(siteId: string,ref: AssetRelease) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(siteId)) throw new Error('Invalid asset destination')
  return `sites/${siteId}/${assetArchiveKey(ref)}`
}

/** Stage an immutable asset candidate in private R2. Live delivery does not
 * create public media or change a manager's selection. A withdrawal is an
 * enforcement event, so its D1 tombstone is committed before both site objects
 * are replaced with permanent empty tombstones. */
export async function receiveAssetCandidate(reference: AssetReference,transfer: AssetTransfer,storage: AssetCandidateStorage): Promise<void> {
  assertAssetReference(reference)
  if (storage.publicBucket === storage.privateBucket) throw new Error('Separate public and private asset buckets required')
  const ref = JSON.parse(canonicalMasterJSON(reference)) as AssetReference
  const context = requireSiteContext(),localSiteId = requireLocalSiteId(),db = createSiteD1Proxy()
  const release = await verifyAssetRelease(transfer.release),withdrawal = validateWithdrawal(transfer.withdrawal,ref)
  if (transfer.siteId !== context.siteId || transfer.localSiteId !== localSiteId || transfer.routingVersion !== context.routingVersion ||
    !Number.isSafeInteger(transfer.centralTenantId) || transfer.centralTenantId < 1 ||
    canonicalMasterJSON(assetReference(release)) !== canonicalMasterJSON(ref) ||
    release.tenantId !== 0 && release.tenantId !== transfer.centralTenantId) throw new Error('Asset candidate destination mismatch')
  const ownership = `EXISTS(SELECT 1 FROM sites s JOIN tenants t ON t.id=s.tenant_id
    WHERE s.id=? AND t.central_source_record_id=?)`
  const key = objectKey(context.siteId,release)
  if (withdrawal) {
    const results = await db.batch([
      db.prepare(`INSERT INTO site_asset_releases(record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
        SELECT ?,?,?,?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`).bind(release.recordId,release.revision,release.tenantId,
        release.digest,assetSnapshotJSON(release),release.operationId,release.createdAt,localSiteId,String(transfer.centralTenantId)),
      db.prepare(`INSERT INTO site_asset_withdrawals(record_id,revision,digest,operation_id,withdrawn_at,reason)
        SELECT ?,?,?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`).bind(ref.recordId,ref.revision,ref.digest,withdrawal.operationId,
        withdrawal.withdrawnAt,withdrawal.reason,localSiteId,String(transfer.centralTenantId)),
      db.prepare(`SELECT 1 AS valid WHERE ${ownership}`).bind(localSiteId,String(transfer.centralTenantId)),
    ])
    if (results[2].results.length !== 1) throw new Error('Asset candidate tenant mapping changed')
    const options = { customMetadata: { assetWithdrawn: '1',assetDigest: release.digest },
      httpMetadata: { contentType: 'application/octet-stream',cacheControl: 'private, no-store' } }
    await storage.privateBucket.put(key,new Uint8Array(),options)
    await storage.publicBucket.put(key,new Uint8Array(),options)
  } else {
    if (!transfer.bytes) throw new Error('Asset candidate bytes unavailable')
    await verifyAssetBytes(release,transfer.bytes)
    await storage.privateBucket.put(key,transfer.bytes,{ onlyIf: { etagDoesNotMatch: '*' },sha256: release.sha256,
      customMetadata: { assetDigest: release.digest },httpMetadata: { contentType: release.mimeType,cacheControl: 'private, no-store' } })
    const object = await storage.privateBucket.get(key)
    if (!object || object.customMetadata?.assetDigest !== release.digest) throw new Error('Asset candidate object unavailable')
    await verifyAssetBytes(release,new Uint8Array(await object.arrayBuffer()))
    const results = await db.batch([
      db.prepare(`INSERT INTO site_asset_releases(record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
        SELECT ?,?,?,?,?,?,? WHERE ${ownership} AND NOT EXISTS(SELECT 1 FROM site_asset_withdrawals WHERE record_id=? AND revision=?)
        ON CONFLICT DO NOTHING`).bind(release.recordId,release.revision,release.tenantId,release.digest,assetSnapshotJSON(release),
        release.operationId,release.createdAt,localSiteId,String(transfer.centralTenantId),release.recordId,release.revision),
      db.prepare(`SELECT 1 AS valid WHERE ${ownership}`).bind(localSiteId,String(transfer.centralTenantId)),
    ])
    if (results[1].results.length !== 1) throw new Error('Asset candidate tenant mapping changed')
  }
  if (!await hasAssetCandidate(ref,storage)) throw new Error('Asset candidate receipt unavailable')
}

export async function hasAssetCandidate(reference: AssetReference,storage: AssetCandidateStorage): Promise<boolean> {
  try {
    assertAssetReference(reference)
    const context = requireSiteContext(),db = createSiteD1Proxy()
    const row = await db.prepare(`SELECT snapshot_json AS snapshot,digest,operation_id AS operationId,created_at AS createdAt
      FROM site_asset_releases WHERE record_id=? AND revision=?`).bind(reference.recordId,reference.revision)
      .first<{ snapshot: string;digest: string;operationId: string;createdAt: string }>()
    if (!row || row.digest !== reference.digest) return false
    const release = await verifyAssetRelease({ ...JSON.parse(row.snapshot),digest: row.digest,operationId: row.operationId,createdAt: row.createdAt })
    const withdrawal = await db.prepare('SELECT digest FROM site_asset_withdrawals WHERE record_id=? AND revision=?')
      .bind(reference.recordId,reference.revision).first<string>('digest')
    const key = objectKey(context.siteId,release)
    if (withdrawal) {
      if (withdrawal !== reference.digest) return false
      const [privateObject,publicObject] = await Promise.all([storage.privateBucket.head(key),storage.publicBucket.head(key)])
      return Boolean(privateObject?.customMetadata?.assetWithdrawn === '1' && publicObject?.customMetadata?.assetWithdrawn === '1')
    }
    const object = await storage.privateBucket.get(key)
    if (!object || object.customMetadata?.assetDigest !== reference.digest) return false
    await verifyAssetBytes(release,new Uint8Array(await object.arrayBuffer()))
    return true
  } catch { return false }
}
