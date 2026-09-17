import { assertSiteId, type SiteState } from './registry'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import type { SiteRole } from './sso'

export type CentralIdentity = { userId: string; sessionId: string }
export type SiteLifecycleInput = { siteId: string; action: 'pause' | 'resume'; expectedRoutingVersion: number; operationId: string }
export type SiteLifecycleReceipt = { operationId: string; siteId: string; action: 'pause' | 'resume';
  expectedRoutingVersion: number; routingVersion: number; appliedAt: string }
export type ManagedSite = { siteId: string; role: SiteRole; state: SiteState; routingVersion: number;
  schemaVersion: number; productionEnabled: boolean }

export class SiteManagementError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 409, message: string) { super(message) }
}

export function parseSiteLifecycleInput(value: unknown): SiteLifecycleInput {
  const input = value as Partial<SiteLifecycleInput> | null
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'action,expectedRoutingVersion,operationId,siteId' ||
      typeof input.siteId !== 'string' || !['pause','resume'].includes(input.action ?? '') ||
      !Number.isSafeInteger(input.expectedRoutingVersion) || Number(input.expectedRoutingVersion) < 1 || Number(input.expectedRoutingVersion) >= Number.MAX_SAFE_INTEGER ||
      typeof input.operationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{15,127}$/.test(input.operationId)) throw new Error('Invalid input')
    assertSiteId(input.siteId)
  } catch { throw new SiteManagementError(400,'Explicit siteId, action, routing version and operation ID required') }
  return input as SiteLifecycleInput
}

async function requireGrant(database: D1Database, identity: CentralIdentity, siteId: string, manager: boolean) {
  const authority = payloadSessionAuthority(database)
  if (!await authority(identity.userId,identity.sessionId)) throw new SiteManagementError(401,'Central login required')
  const row = await database.prepare(`SELECT role FROM site_runtime_access WHERE site_id=? AND user_id=?`)
    .bind(siteId,identity.userId).first<{ role: SiteRole }>()
  if (!row || (manager && row.role !== 'manager')) throw new SiteManagementError(403,'Site permission required')
  return row.role
}

/** Metadata from central D1 only; paused sites remain visible to their staff. */
export async function getManagedSite(database: D1Database, identity: CentralIdentity, siteId: string): Promise<ManagedSite> {
  try { assertSiteId(siteId) } catch { throw new SiteManagementError(400,'Explicit siteId required') }
  await requireGrant(database,identity,siteId,false)
  const row = await database.prepare(`SELECT site_id AS siteId, migration_state AS state,
    routing_version AS routingVersion, schema_version AS schemaVersion, production_enabled AS productionEnabled
    FROM site_runtime_registry WHERE site_id=?`).bind(siteId).first<Omit<ManagedSite,'role' | 'productionEnabled'> & { productionEnabled: number }>()
  if (!row) throw new SiteManagementError(403,'Site permission required')
  const role = await requireGrant(database,identity,siteId,false)
  return { ...row,role,productionEnabled: row.productionEnabled === 1 }
}

/** Explicit manager grant, live original central session, CAS and immutable
 * operation identity. The INSERT's own authorization predicate closes the gap
 * between the asynchronous precheck and the state mutation. */
export async function changeSiteLifecycle(database: D1Database, identity: CentralIdentity, value: unknown): Promise<SiteLifecycleReceipt & { replayed: boolean }> {
  const input = parseSiteLifecycleInput(value)
  await requireGrant(database,identity,input.siteId,true)
  const result = await database.prepare(`INSERT INTO site_lifecycle_operations
    (operation_id,site_id,actor_user_id,action,expected_version,routing_version,applied_at)
    SELECT ?,r.site_id,?,?,?,r.routing_version+1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM site_runtime_registry r
    JOIN site_runtime_access a ON a.site_id=r.site_id AND a.user_id=? AND a.role='manager'
    JOIN users u ON u.id=a.user_id
    JOIN users_sessions s ON s._parent_id=u.id AND s.id=?
    WHERE r.site_id=? AND r.routing_version=? AND r.migration_state=?
      AND julianday(s.expires_at)>julianday('now')
      AND (u.lock_until IS NULL OR julianday(u.lock_until)<=julianday('now'))
      AND NOT EXISTS (SELECT 1 FROM site_lifecycle_operations WHERE operation_id=?)
    RETURNING operation_id`).bind(input.operationId,identity.userId,input.action,input.expectedRoutingVersion,
      identity.userId,identity.sessionId,input.siteId,input.expectedRoutingVersion,input.action === 'pause' ? 'active' : 'paused',input.operationId)
    .first<{ operation_id: string }>()
  // A response lost after commit is safely retried with the same operation ID.
  // Even historical receipts require a currently valid session and manager grant.
  await requireGrant(database,identity,input.siteId,true)
  const row = await database.prepare(`SELECT operation_id AS operationId,site_id AS siteId,actor_user_id AS actorUserId,
    action,expected_version AS expectedRoutingVersion,routing_version AS routingVersion,applied_at AS appliedAt
    FROM site_lifecycle_operations WHERE operation_id=?`).bind(input.operationId)
    .first<SiteLifecycleReceipt & { actorUserId: string }>()
  if (!row || row.actorUserId !== identity.userId || row.siteId !== input.siteId || row.action !== input.action || row.expectedRoutingVersion !== input.expectedRoutingVersion) {
    throw new SiteManagementError(409,'Site state or operation changed; reload the site')
  }
  const { actorUserId: _actor, ...receipt } = row
  return { ...receipt,replayed: !result }
}
