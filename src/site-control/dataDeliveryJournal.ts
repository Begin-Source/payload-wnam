import { optionalSiteContext } from '../site-runtime/context'
import { assertAssetReference, type AssetReference, type AssetTransfer } from './assetSnapshot'
import { assertConfigReference, type ConfigBundle, type ConfigReference } from './configSnapshot'
import { exportAssetTransfer } from './assetPublisher'
import { exportConfigBundle } from './configPublisher'
import { canonicalMasterJSON, assertMasterReference, masterDigest, type MasterBundle, type MasterReference } from './masterSnapshot'
import { exportMasterBundle } from './masterPublisher'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import { provisionUuidSchema } from './provisionPlan'
import { assertSiteId } from './registry'
import { SiteManagementError, type CentralIdentity } from './siteLifecycle'

export type DataDeliveryKind = 'master' | 'config' | 'asset'
export type DataDeliveryReference = MasterReference | ConfigReference | AssetReference
export type DataDeliveryValue = MasterBundle | ConfigBundle | AssetTransfer
export type DataDeliveryState = 'queued' | 'leased' | 'retry' | 'succeeded' | 'dead' | 'cancelled'
export type DataDeliveryInput = { operationId: string; siteId: string; routingVersion: number; kind: DataDeliveryKind; reference: DataDeliveryReference }
export type DataDeliveryReceipt = { receivedDigest: string; receivedAt: string }
export type DataDeliverySummary = DataDeliveryInput & { actorUserId: string; workerGroup: string; state: DataDeliveryState;
  attemptCount: number; createdAt: string; updatedAt: string; completedAt: string | null; lastErrorCode: string | null;
  receipt: DataDeliveryReceipt | null }
export type MachineDataDelivery = { operationId: string; siteId: string; routingVersion: number; workerGroup: string;
  kind: DataDeliveryKind; reference: DataDeliveryReference; referenceDigest: string; value: DataDeliveryValue; attemptCount: number }

type DeliveryRow = {
  operationId: string; siteId: string; actorUserId: string; workerGroup: string; routingVersion: number; kind: DataDeliveryKind;
  referenceJson: string; referenceDigest: string; capabilityHash: string; state: DataDeliveryState; attemptCount: number; createdAt: string;
  updatedAt: string; completedAt: string | null; lastErrorCode: string | null; receiptJson: string | null
}
const selection = `operation_id AS operationId,site_id AS siteId,actor_user_id AS actorUserId,worker_group AS workerGroup,
  routing_version AS routingVersion,kind,reference_json AS referenceJson,reference_digest AS referenceDigest,capability_hash AS capabilityHash,state,
  attempt_count AS attemptCount,created_at AS createdAt,updated_at AS updatedAt,completed_at AS completedAt,
  last_error_code AS lastErrorCode,receipt_json AS receiptJson`
const capabilityPattern = /^[0-9a-f]{64}$/
const errorCodePattern = /^[a-z][a-z0-9_]{2,63}$/
const centralOnly = () => { if (optionalSiteContext()) throw new Error('Site data delivery journal is central-only') }

function parseReference(kind: DataDeliveryKind, value: unknown): DataDeliveryReference {
  const detached = JSON.parse(canonicalMasterJSON(value)) as DataDeliveryReference
  if (kind === 'master') assertMasterReference(detached as MasterReference)
  else if (kind === 'config') assertConfigReference(detached as ConfigReference)
  else assertAssetReference(detached as AssetReference)
  return detached
}

export function parseDataDeliveryInput(value: unknown): DataDeliveryInput {
  const input = value as Partial<DataDeliveryInput> | null
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'kind,operationId,reference,routingVersion,siteId' ||
      !provisionUuidSchema.safeParse(input.operationId).success || typeof input.siteId !== 'string' ||
      !['master','config','asset'].includes(input.kind ?? '') || !Number.isSafeInteger(input.routingVersion) || Number(input.routingVersion) < 1) {
      throw new Error('Invalid delivery')
    }
    assertSiteId(input.siteId)
    return { operationId: input.operationId!,siteId: input.siteId,routingVersion: input.routingVersion!,kind: input.kind as DataDeliveryKind,
      reference: parseReference(input.kind as DataDeliveryKind,input.reference) }
  } catch { throw new SiteManagementError(400,'Explicit site, route, operation and pinned data reference required') }
}

function summary(row: DeliveryRow): DataDeliverySummary {
  return { operationId: row.operationId,siteId: row.siteId,actorUserId: row.actorUserId,workerGroup: row.workerGroup,
    routingVersion: row.routingVersion,kind: row.kind,reference: parseReference(row.kind,JSON.parse(row.referenceJson)),state: row.state,
    attemptCount: row.attemptCount,createdAt: row.createdAt,updatedAt: row.updatedAt,completedAt: row.completedAt,
    lastErrorCode: row.lastErrorCode,receipt: row.receiptJson ? JSON.parse(row.receiptJson) as DataDeliveryReceipt : null }
}

async function requireManager(database: D1Database, identity: CentralIdentity, siteId: string): Promise<void> {
  centralOnly()
  if (!await payloadSessionAuthority(database)(identity.userId,identity.sessionId)) throw new SiteManagementError(401,'Central login required')
  const allowed = await database.prepare(`SELECT 1 AS allowed FROM site_runtime_access
    WHERE site_id=? AND user_id=? AND role='manager'`).bind(siteId,identity.userId).first()
  if (!allowed) throw new SiteManagementError(403,'Site manager permission required')
}

async function exportPinned(database: D1Database, archive: R2Bucket, input: DataDeliveryInput): Promise<DataDeliveryValue> {
  if (input.kind === 'master') return exportMasterBundle(database,input.siteId,input.routingVersion,input.reference as MasterReference)
  if (input.kind === 'config') return exportConfigBundle(database,input.siteId,input.routingVersion,input.reference as ConfigReference)
  return exportAssetTransfer(database,archive,input.siteId,input.routingVersion,input.reference as AssetReference)
}

/** Creates one immutable delivery intent. The raw capability must be generated
 * by the trusted caller and placed only on the target group's queue. */
export async function requestDataDelivery(database: D1Database, archive: R2Bucket, identity: CentralIdentity,
  value: unknown, capability: string): Promise<DataDeliverySummary & { replayed: boolean }> {
  centralOnly()
  const input = parseDataDeliveryInput(value)
  if (!capabilityPattern.test(capability)) throw new SiteManagementError(400,'Delivery capability required')
  await requireManager(database,identity,input.siteId)
  // Verify the pinned release, tenant boundary, route and archive before the
  // durable intent is admitted. Immutable releases make this safe to repeat.
  await exportPinned(database,archive,input)
  const referenceJson = canonicalMasterJSON(input.reference), referenceDigest = await masterDigest(referenceJson)
  const capabilityHash = await masterDigest(capability), now = new Date().toISOString()
  const inserted = await database.prepare(`INSERT INTO site_data_deliveries
    (operation_id,site_id,actor_user_id,worker_group,routing_version,kind,reference_json,reference_digest,capability_hash,created_at,updated_at)
    SELECT ?,r.site_id,?,r.worker_group,r.routing_version,?,?,?,?,?,?
    FROM site_runtime_registry r
    JOIN site_runtime_access a ON a.site_id=r.site_id AND a.user_id=? AND a.role='manager'
    JOIN users u ON u.id=a.user_id
    JOIN users_sessions s ON s._parent_id=u.id AND s.id=?
    WHERE r.site_id=? AND r.routing_version=? AND r.migration_state IN ('active','provisioning')
      AND julianday(s.expires_at)>julianday('now')
      AND (u.lock_until IS NULL OR julianday(u.lock_until)<=julianday('now'))
    ON CONFLICT DO NOTHING RETURNING operation_id`).bind(input.operationId,identity.userId,input.kind,referenceJson,referenceDigest,
      capabilityHash,now,now,identity.userId,identity.sessionId,input.siteId,input.routingVersion).first()
  await requireManager(database,identity,input.siteId)
  const row = await database.prepare(`SELECT ${selection} FROM site_data_deliveries WHERE operation_id=?`).bind(input.operationId).first<DeliveryRow>()
  if (!row || row.actorUserId !== identity.userId || row.siteId !== input.siteId || row.routingVersion !== input.routingVersion ||
    row.kind !== input.kind || row.referenceJson !== referenceJson || row.referenceDigest !== referenceDigest || row.capabilityHash !== capabilityHash) {
    throw new SiteManagementError(409,'Delivery operation identity or route changed')
  }
  return { ...summary(row),replayed: !inserted }
}

export async function readDataDelivery(database: D1Database, identity: CentralIdentity, operationId: string): Promise<DataDeliverySummary> {
  centralOnly()
  if (!provisionUuidSchema.safeParse(operationId).success) throw new SiteManagementError(400,'Explicit delivery operation required')
  const row = await database.prepare(`SELECT ${selection} FROM site_data_deliveries WHERE operation_id=?`).bind(operationId).first<DeliveryRow>()
  if (!row) throw new SiteManagementError(403,'Delivery unavailable')
  await requireManager(database,identity,row.siteId)
  return summary(row)
}

function parseReceipt(value: unknown): DataDeliveryReceipt {
  const receipt = value as Partial<DataDeliveryReceipt> | null
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join(',') !== 'receivedAt,receivedDigest' ||
    typeof receipt.receivedDigest !== 'string' || !capabilityPattern.test(receipt.receivedDigest) ||
    typeof receipt.receivedAt !== 'string' || !Number.isFinite(Date.parse(receipt.receivedAt)) || receipt.receivedAt.length > 40) {
    throw new Error('Invalid delivery receipt')
  }
  return { receivedDigest: receipt.receivedDigest,receivedAt: receipt.receivedAt }
}

async function capabilityHash(capability: string): Promise<string> {
  if (!capabilityPattern.test(capability)) throw new Error('Invalid delivery capability')
  return masterDigest(capability)
}

/** Claims a bounded 180-second lease and returns only the exact pinned object.
 * Exact retries during the same lease do not consume another attempt. */
export async function readMachineDataDelivery(database: D1Database, archive: R2Bucket, operationId: string,
  capability: string, now = Date.now()): Promise<MachineDataDelivery> {
  centralOnly()
  if (!provisionUuidSchema.safeParse(operationId).success || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid delivery claim')
  const hash = await capabilityHash(capability), expires = now + 180_000, iso = new Date(now).toISOString()
  let row = await database.prepare(`UPDATE site_data_deliveries AS d SET state='leased',attempt_count=attempt_count+1,
    lease_owner=worker_group,lease_expires_at=?,next_attempt_at=NULL,updated_at=?,last_error_code=NULL
    WHERE operation_id=? AND capability_hash=? AND attempt_count<5
      AND (state='queued' OR state='retry' AND COALESCE(next_attempt_at,0)<=? OR state='leased' AND COALESCE(lease_expires_at,0)<=?)
      AND EXISTS (SELECT 1 FROM site_runtime_registry r WHERE r.site_id=d.site_id AND r.worker_group=d.worker_group
        AND r.routing_version=d.routing_version AND r.migration_state IN ('active','provisioning'))
    RETURNING ${selection}`).bind(expires,iso,operationId,hash,now,now).first<DeliveryRow>()
  if (!row) row = await database.prepare(`SELECT ${selection} FROM site_data_deliveries d
    WHERE operation_id=? AND capability_hash=? AND state='leased' AND lease_owner=worker_group AND lease_expires_at>?
      AND EXISTS (SELECT 1 FROM site_runtime_registry r WHERE r.site_id=d.site_id AND r.worker_group=d.worker_group
        AND r.routing_version=d.routing_version AND r.migration_state IN ('active','provisioning'))`).bind(operationId,hash,now).first<DeliveryRow>()
  if (!row) throw new Error('Delivery unavailable')
  const input = { operationId: row.operationId,siteId: row.siteId,routingVersion: row.routingVersion,kind: row.kind,
    reference: parseReference(row.kind,JSON.parse(row.referenceJson)) }
  try {
    const value = await exportPinned(database,archive,input)
    const current = await database.prepare(`SELECT state,lease_expires_at AS leaseExpiresAt FROM site_data_deliveries
      WHERE operation_id=? AND capability_hash=?`).bind(operationId,hash).first<{ state: DataDeliveryState; leaseExpiresAt: number | null }>()
    if (!current || current.state !== 'leased' || !current.leaseExpiresAt || current.leaseExpiresAt <= now) throw new Error('Delivery lease changed')
    return { ...input,workerGroup: row.workerGroup,referenceDigest: row.referenceDigest,value,attemptCount: row.attemptCount }
  } catch (error) {
    await recordMachineDeliveryFailure(database,operationId,capability,'source_unavailable',now)
    throw error
  }
}

export async function acknowledgeMachineDataDelivery(database: D1Database, operationId: string, capability: string,
  value: unknown, now = Date.now()): Promise<DataDeliverySummary> {
  centralOnly()
  if (!provisionUuidSchema.safeParse(operationId).success || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid delivery acknowledgement')
  const hash = await capabilityHash(capability), receipt = parseReceipt(value), json = canonicalMasterJSON(receipt), iso = new Date(now).toISOString()
  await database.prepare(`UPDATE site_data_deliveries AS d SET state='succeeded',receipt_json=?,completed_at=?,updated_at=?,
    lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,last_error_code=NULL
    WHERE operation_id=? AND capability_hash=? AND reference_digest=? AND state='leased' AND lease_expires_at>=?
      AND EXISTS (SELECT 1 FROM site_runtime_registry r WHERE r.site_id=d.site_id AND r.worker_group=d.worker_group
        AND r.routing_version=d.routing_version AND r.migration_state IN ('active','provisioning'))`)
    .bind(json,iso,iso,operationId,hash,receipt.receivedDigest,now).run()
  const row = await database.prepare(`SELECT ${selection} FROM site_data_deliveries WHERE operation_id=? AND capability_hash=?`).bind(operationId,hash).first<DeliveryRow>()
  if (!row || row.state !== 'succeeded' || row.receiptJson !== json) throw new Error('Delivery acknowledgement unavailable')
  return summary(row)
}

export async function recordMachineDeliveryFailure(database: D1Database, operationId: string, capability: string,
  errorCode: string, now = Date.now()): Promise<DataDeliverySummary> {
  centralOnly()
  if (!provisionUuidSchema.safeParse(operationId).success || !errorCodePattern.test(errorCode) || !Number.isSafeInteger(now) || now < 0) {
    throw new Error('Invalid delivery failure')
  }
  const hash = await capabilityHash(capability), iso = new Date(now).toISOString()
  await database.prepare(`UPDATE site_data_deliveries SET state=CASE WHEN attempt_count>=5 THEN 'dead' ELSE 'retry' END,
    next_attempt_at=CASE WHEN attempt_count>=5 THEN NULL ELSE ?+MIN(300000,1000*(1 << MIN(attempt_count,8))) END,
    lease_owner=NULL,lease_expires_at=NULL,updated_at=?,completed_at=CASE WHEN attempt_count>=5 THEN ? ELSE NULL END,last_error_code=?
    WHERE operation_id=? AND capability_hash=? AND state='leased'`).bind(now,iso,iso,errorCode,operationId,hash).run()
  const row = await database.prepare(`SELECT ${selection} FROM site_data_deliveries WHERE operation_id=? AND capability_hash=?`).bind(operationId,hash).first<DeliveryRow>()
  if (!row || !['retry','dead'].includes(row.state) || row.lastErrorCode !== errorCode) throw new Error('Delivery failure unavailable')
  return summary(row)
}
