import type { PayloadRequest } from 'payload'
import { optionalSiteContext } from '../site-runtime/context'
import { userHasUnscopedAdminAccess } from '../utilities/superAdmin'
import { userHasTenantGeneralManagerRole } from '../utilities/userRoles'
import { getTenantIdsForUser } from '../utilities/tenantScope'
import { parseRelationshipId } from '../utilities/parseRelationshipId'
import { canonicalMasterJSON, masterDigest } from './masterSnapshot'
import { readSiteRegistration } from './registry'
import { assetArchiveKey, assetBytesDigest, assetSnapshotJSON, assertAssetReference, MAX_ASSET_BYTES, verifyAssetBytes, verifyAssetRelease,
  type AssetReference, type AssetRelease, type AssetSnapshot, type AssetTransfer, type AssetWithdrawal } from './assetSnapshot'

type Row = { snapshot_json: string; digest: string; operation_id: string; created_at: string }
const decode = (row: Row) => verifyAssetRelease({ ...JSON.parse(row.snapshot_json),digest: row.digest,operationId: row.operation_id,createdAt: row.created_at })
function centralOnly() { if (optionalSiteContext()) throw new Error('Central asset capability inside site request') }
function authorize(req: PayloadRequest, tenantId?: number) {
  centralOnly()
  if (req.payload.config.custom.payloadRole !== 'central' || !req.user || !(userHasUnscopedAdminAccess(req.user) ||
    (userHasTenantGeneralManagerRole(req.user) && tenantId !== 0 && (tenantId === undefined || getTenantIdsForUser(req.user).includes(tenantId))))) {
    throw new Error('Central asset publisher permission required')
  }
}
function operation(id: string) { if (typeof id !== 'string' || !id || id.length > 128) throw new Error('Explicit asset operation ID required') }
function sourceKey(source: Record<string,unknown>): string {
  const filename = source.filename, prefix = source.prefix ?? ''
  if (typeof filename !== 'string' || !filename || filename.includes('/') || typeof prefix !== 'string') throw new Error('Invalid source asset key')
  const key = prefix ? `${prefix}/${filename}` : filename
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0') || key.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid source asset key')
  return key
}
export async function readAssetRelease(db: D1Database, ref: AssetReference): Promise<AssetRelease> {
  centralOnly(); assertAssetReference(ref)
  const row = await db.prepare('SELECT * FROM central_asset_releases WHERE record_id=? AND revision=?').bind(ref.recordId,ref.revision).first<Row>()
  if (!row || row.digest !== ref.digest) throw new Error('Pinned asset release unavailable')
  return decode(row)
}
export async function readAssetWithdrawal(db: D1Database, ref: AssetReference): Promise<AssetWithdrawal | null> {
  centralOnly(); assertAssetReference(ref)
  return db.prepare(`SELECT record_id AS recordId,revision,digest,operation_id AS operationId,withdrawn_at AS withdrawnAt,reason
    FROM central_asset_withdrawals WHERE record_id=? AND revision=? AND digest=?`).bind(ref.recordId,ref.revision,ref.digest).first<AssetWithdrawal>()
}
export async function requirePublishedAsset(db: D1Database, ref: AssetReference, tenantId: number): Promise<void> {
  const asset = await readAssetRelease(db,ref)
  if ((asset.tenantId !== 0 && asset.tenantId !== tenantId) || await readAssetWithdrawal(db,ref)) throw new Error('Asset scope or withdrawal prevents publication')
}
export type PublishAssetInput = { recordId: string; expectedRevision: number; expectedUpdatedAt: string; global: boolean; operationId: string }
/** Persist intent before R2. A retry pins both metadata and bytes, even when the
 * editable source changes after an interrupted R2/D1 publication. */
export async function publishAssetFromPayload(db: D1Database, sourceBucket: R2Bucket, archive: R2Bucket, req: PayloadRequest, input: PublishAssetInput): Promise<AssetRelease> {
  authorize(req); operation(input.operationId)
  if (sourceBucket === archive || typeof input.global !== 'boolean' || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('Explicit asset source, archive and revision required')
  assertAssetReference({ recordId: input.recordId,revision: input.expectedRevision+1,digest: '0'.repeat(64) })
  const source = await req.payload.findByID({ collection: 'media',id: input.recordId,req,depth: 0,overrideAccess: false }) as unknown as Record<string,unknown>
  const tenantId = input.global ? 0 : parseRelationshipId(source.tenant)
  if (tenantId === null) throw new Error('Asset source tenant required')
  authorize(req,tenantId)
  const json = canonicalMasterJSON({ ...input,actor: String(req.user!.id) })
  type Intent = Row & { request_json: string; committed: number }
  const intent = () => db.prepare('SELECT * FROM central_asset_publications WHERE operation_id=?').bind(input.operationId).first<Intent>()
  let stored = await intent()
  const readSource = async () => {
    const object = await sourceBucket.get(sourceKey(source))
    if (!object || object.size > MAX_ASSET_BYTES || object.size !== source.filesize) throw new Error('Asset source bytes unavailable or too large')
    return new Uint8Array(await object.arrayBuffer())
  }
  if (!stored) {
    if (source.updatedAt !== input.expectedUpdatedAt) throw new Error('Asset source changed; refresh before publishing')
    if (source.assetClass === 'evidence') throw new Error('Private evidence cannot be published as a public asset')
    const bytes = await readSource()
    const snapshot: AssetSnapshot = { format: 1,recordId: input.recordId,revision: input.expectedRevision+1,tenantId,sourceUpdatedAt: input.expectedUpdatedAt,
      alt: source.alt as string,mimeType: source.mimeType as AssetSnapshot['mimeType'],size: bytes.length,sha256: await assetBytesDigest(bytes),
      width: source.width as number | null,height: source.height as number | null }
    const snapshotJSON = assetSnapshotJSON(snapshot),digest = await masterDigest(snapshotJSON)
    await verifyAssetBytes(snapshot,bytes)
    await db.prepare(`INSERT INTO central_asset_publications(operation_id,request_json,snapshot_json,digest,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`)
      .bind(input.operationId,json,snapshotJSON,digest,new Date().toISOString()).run()
    stored = await intent()
  }
  if (!stored || stored.request_json !== json) throw new Error('Asset operation conflict')
  const release = await decode(stored)
  if (release.tenantId !== tenantId) throw new Error('Asset source tenant changed')
  const key = assetArchiveKey(release)
  let object = await archive.get(key)
  if (!object && !stored.committed) {
    const bytes = await readSource(); await verifyAssetBytes(release,bytes)
    await archive.put(key,bytes,{ onlyIf: { etagDoesNotMatch: '*' },sha256: release.sha256,
      httpMetadata: { contentType: release.mimeType,cacheControl: 'private, no-store' } })
    object = await archive.get(key)
  }
  if (!object) throw new Error('Immutable asset archive unavailable')
  await verifyAssetBytes(release,new Uint8Array(await object.arrayBuffer()))
  await db.batch([
    db.prepare(`INSERT INTO central_asset_releases(record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
      SELECT ?,?,?,?,?,?,? WHERE ?=COALESCE((SELECT MAX(revision) FROM central_asset_releases WHERE record_id=?),0)
      AND NOT EXISTS(SELECT 1 FROM central_asset_releases WHERE record_id=? AND tenant_id!=?) ON CONFLICT DO NOTHING`)
      .bind(release.recordId,release.revision,tenantId,release.digest,stored.snapshot_json,input.operationId,release.createdAt,input.expectedRevision,release.recordId,release.recordId,tenantId),
    db.prepare(`UPDATE central_asset_publications SET committed=CASE WHEN EXISTS(SELECT 1 FROM central_asset_releases WHERE operation_id=? AND digest=?)
      THEN 1 ELSE -1 END WHERE operation_id=? AND request_json=?`).bind(input.operationId,release.digest,input.operationId,json),
  ])
  return readAssetRelease(db,{ recordId: release.recordId,revision: release.revision,digest: release.digest })
}
export async function withdrawAssetFromPayload(db: D1Database, req: PayloadRequest, ref: AssetReference, operationId: string, reason: string): Promise<AssetWithdrawal> {
  authorize(req); operation(operationId)
  const release = await readAssetRelease(db,ref); authorize(req,release.tenantId)
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new Error('Asset withdrawal reason required')
  await db.prepare(`INSERT INTO central_asset_withdrawals(record_id,revision,digest,operation_id,withdrawn_at,reason) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
    .bind(ref.recordId,ref.revision,ref.digest,operationId,new Date().toISOString(),reason).run()
  const result = await readAssetWithdrawal(db,ref)
  if (!result || result.operationId !== operationId || result.reason !== reason) throw new Error('Asset withdrawal operation conflict')
  return result
}
/** Only an authenticated internal transport may invoke this export capability. */
export async function exportAssetTransfer(db: D1Database, archive: R2Bucket, siteId: string, routingVersion: number, ref: AssetReference): Promise<AssetTransfer> {
  centralOnly(); assertAssetReference(ref)
  const registration = await readSiteRegistration(db,siteId)
  if (!registration || registration.routingVersion !== routingVersion || !['active','provisioning'].includes(registration.migrationState)) throw new Error('Asset routing unavailable')
  const tenant = await db.prepare('SELECT tenant_id FROM sites WHERE runtime_site_id=?').bind(siteId).first<number>('tenant_id')
  const release = await readAssetRelease(db,ref)
  if (!Number.isSafeInteger(tenant) || tenant! < 1 || (release.tenantId !== 0 && release.tenantId !== tenant)) throw new Error('Cross-tenant asset delivery rejected')
  let withdrawal = await readAssetWithdrawal(db,ref),bytes: Uint8Array | null = null
  if (!withdrawal) {
    const object = await archive.get(assetArchiveKey(release))
    if (!object) throw new Error('Asset archive unavailable')
    bytes = new Uint8Array(await object.arrayBuffer()); await verifyAssetBytes(release,bytes)
    withdrawal = await readAssetWithdrawal(db,ref)
  }
  const current = await readSiteRegistration(db,siteId)
  const currentTenant = await db.prepare('SELECT tenant_id FROM sites WHERE runtime_site_id=?').bind(siteId).first<number>('tenant_id')
  if (!current || canonicalMasterJSON(current) !== canonicalMasterJSON(registration) || currentTenant !== tenant) throw new Error('Asset routing changed')
  return { siteId,localSiteId: registration.localSiteId,routingVersion,centralTenantId: tenant!,release,withdrawal,bytes: withdrawal ? null : bytes }
}
