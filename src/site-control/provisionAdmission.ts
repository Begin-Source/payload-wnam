import { z } from 'zod'
import { optionalSiteContext } from '../site-runtime/context'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import { provisionDigest,provisionUuidSchema } from './provisionPlan'
import { provisionActorPermission,provisionOwnerPermission } from './provisionAdmissionSchema'
import { SiteManagementError,type CentralIdentity } from './siteLifecycle'

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const inputSchema = z.object({ requestId: provisionUuidSchema,
  siteId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/),name: z.string().trim().min(1).max(120),
  tenantId: positive,ownerUserId: positive,timezone: z.string().min(1).max(64),
}).strict()
export type ProvisionAdmissionInput = z.infer<typeof inputSchema>
export function parseProvisionAdmission(input: unknown): ProvisionAdmissionInput {
  try {
    const parsed = inputSchema.parse(input)
    new Intl.DateTimeFormat('en',{ timeZone: parsed.timezone })
    return parsed
  } catch { throw new SiteManagementError(400,'Explicit site identity, tenant, owner, name and timezone required') }
}
const centralOnly = () => { if (optionalSiteContext()) throw new Error('Provision admission is central-only') }
async function requireActor(database: D1Database,identity: CentralIdentity,tenantId: number) {
  centralOnly()
  if (!await payloadSessionAuthority(database)(identity.userId,identity.sessionId)) throw new SiteManagementError(401,'Central login required')
  const row = await database.prepare(`SELECT 1 AS allowed WHERE ${provisionActorPermission('?','?')}`)
    .bind(identity.userId,tenantId).first()
  if (!row) throw new SiteManagementError(403,'Tenant provisioning permission required')
}
type AdmissionRow = { requestId: string; actorUserId: number; inputJson: string; state: 'queued' | 'provisioning' | 'cancelled';
  createdAt: string; cancelledAt: string | null; checkpoint: number | null; completedAt: string | null }
async function row(database: D1Database,requestId: string) {
  return database.prepare(`SELECT q.request_id AS requestId,q.actor_user_id AS actorUserId,q.input_json AS inputJson,
    q.state,q.created_at AS createdAt,q.cancelled_at AS cancelledAt,o.checkpoint,o.completed_at AS completedAt
    FROM site_provision_requests q LEFT JOIN site_provision_operations o ON o.operation_id=q.request_id WHERE q.request_id=?`)
    .bind(requestId).first<AdmissionRow>()
}
function summary(value: AdmissionRow) {
  const { inputJson,...metadata } = value
  return { ...metadata,input: parseProvisionAdmission(JSON.parse(inputJson)),
    state: value.completedAt ? 'completed' as const : value.state }
}
export type ProvisionAdmissionSummary = ReturnType<typeof summary>
export type ProvisionAdmissionPage = { requests: ProvisionAdmissionSummary[]; nextCursor: string | null }
export type ProvisionChoicePage = { choices: { id: number; label: string }[]; nextAfter: number | null }

/** Paginate one authorized tenant in durable creation order, including cancelled
 * requests. No prepared resource manifests or site database fan-out. */
export async function listProvisionAdmissions(database: D1Database,identity: CentralIdentity,tenantId: number,after = ''): Promise<ProvisionAdmissionPage> {
  if (!positive.safeParse(tenantId).success || after && !provisionUuidSchema.safeParse(after).success) throw new SiteManagementError(400,'Invalid request page')
  await requireActor(database,identity,tenantId)
  if (after && !await database.prepare('SELECT 1 FROM site_provision_requests WHERE request_id=? AND tenant_id=?').bind(after,tenantId).first()) {
    throw new SiteManagementError(400,'Invalid request cursor')
  }
  const rows = (await database.prepare(`SELECT q.request_id AS requestId,q.actor_user_id AS actorUserId,q.input_json AS inputJson,
    q.state,q.created_at AS createdAt,q.cancelled_at AS cancelledAt,o.checkpoint,o.completed_at AS completedAt
    FROM site_provision_requests q LEFT JOIN site_provision_operations o ON o.operation_id=q.request_id
    WHERE q.tenant_id=? AND (?='' OR (q.created_at,q.request_id)<
      (SELECT created_at,request_id FROM site_provision_requests WHERE request_id=? AND tenant_id=?))
    ORDER BY q.created_at DESC,q.request_id DESC LIMIT 51`).bind(tenantId,after,after,tenantId).all<AdmissionRow>()).results
  await requireActor(database,identity,tenantId)
  return { requests: rows.slice(0,50).map(summary),nextCursor: rows.length > 50 ? rows[49].requestId : null }
}

/** Only names needed for an authorized form; password/session fields are never
 * selected. Empty tenant choices hide creation from ordinary site managers. */
export async function provisionAdmissionChoices(database: D1Database,identity: CentralIdentity,kind: 'tenants' | 'owners',tenantId?: number,after = 0): Promise<ProvisionChoicePage> {
  centralOnly()
  if (!Number.isSafeInteger(after) || after < 0 || !['tenants','owners'].includes(kind) ||
    (kind === 'owners' && !positive.safeParse(tenantId).success) || (kind === 'tenants' && tenantId !== undefined)) throw new SiteManagementError(400,'Invalid form choices')
  const authority = payloadSessionAuthority(database)
  if (!await authority(identity.userId,identity.sessionId)) throw new SiteManagementError(401,'Central login required')
  if (kind === 'owners') await requireActor(database,identity,tenantId!)
  const rows = kind === 'tenants' ?
    (await database.prepare(`SELECT t.id,t.name AS label FROM tenants t WHERE t.id>? AND ${provisionActorPermission('?','t.id')} ORDER BY t.id LIMIT 51`)
      .bind(after,identity.userId).all<{ id: number; label: string }>()).results :
    (await database.prepare(`SELECT u.id,u.email AS label FROM users u WHERE u.id>? AND ${provisionOwnerPermission('u.id','?')} ORDER BY u.id LIMIT 51`)
      .bind(after,tenantId!).all<{ id: number; label: string }>()).results
  if (!await authority(identity.userId,identity.sessionId)) throw new SiteManagementError(401,'Central login required')
  if (kind === 'owners') await requireActor(database,identity,tenantId!)
  // Recheck the tenant choices after the async query before returning names.
  if (kind === 'tenants' && rows.length) {
    const count = await database.prepare(`SELECT COUNT(*) AS n FROM tenants t WHERE t.id IN (${rows.map(() => '?').join(',')})
      AND ${provisionActorPermission('?','t.id')}`).bind(...rows.map(row => row.id),identity.userId).first<number>('n')
    if (count !== rows.length) throw new SiteManagementError(403,'Tenant provisioning permission changed')
  }
  return { choices: rows.slice(0,50),nextAfter: rows.length > 50 ? rows[49].id : null }
}
/** Public summaries omit prepared infrastructure manifests and lease details. */
export async function readProvisionAdmission(database: D1Database,identity: CentralIdentity,requestId: string) {
  centralOnly()
  if (!provisionUuidSchema.safeParse(requestId).success) throw new SiteManagementError(400,'Explicit request ID required')
  if (!await payloadSessionAuthority(database)(identity.userId,identity.sessionId)) throw new SiteManagementError(401,'Central login required')
  const saved = await row(database,requestId)
  if (!saved) throw new SiteManagementError(403,'Provision request unavailable')
  await requireActor(database,identity,parseProvisionAdmission(JSON.parse(saved.inputJson)).tenantId)
  return summary(saved)
}
/** One immutable human request. Infrastructure IDs and code paths are selected
 * later by the checked cloud planner, never by this browser-facing input. */
export async function submitProvisionAdmission(database: D1Database,identity: CentralIdentity,value: unknown) {
  centralOnly()
  const input = parseProvisionAdmission(value),json = JSON.stringify(input)
  await requireActor(database,identity,input.tenantId)
  const inserted = await database.prepare(`INSERT INTO site_provision_requests
    (request_id,site_id,actor_user_id,tenant_id,owner_user_id,input_json,input_digest,created_at,local_site_id)
    SELECT ?,?,?,?, ?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      (SELECT COALESCE(MAX(id),0)+1 FROM (
        SELECT id FROM sites UNION ALL SELECT local_site_id AS id FROM site_runtime_registry
        UNION ALL SELECT local_site_id AS id FROM site_provision_operations
        UNION ALL SELECT local_site_id AS id FROM site_provision_requests))
    WHERE ${provisionActorPermission('?','?')} AND ${provisionOwnerPermission('?','?')}
      AND EXISTS (SELECT 1 FROM users_sessions s WHERE s._parent_id=? AND s.id=? AND julianday(s.expires_at)>julianday('now'))
      AND EXISTS (SELECT 1 FROM tenants t WHERE t.id=?)
      AND NOT EXISTS (SELECT 1 FROM site_runtime_registry WHERE site_id=?)
      AND NOT EXISTS (SELECT 1 FROM site_provision_operations WHERE site_id=?)
      AND NOT EXISTS (SELECT 1 FROM sites WHERE runtime_site_id=?)
    ON CONFLICT DO NOTHING RETURNING request_id`).bind(input.requestId,input.siteId,identity.userId,input.tenantId,input.ownerUserId,json,provisionDigest(json),
    identity.userId,input.tenantId,input.ownerUserId,input.tenantId,identity.userId,identity.sessionId,input.tenantId,input.siteId,input.siteId,input.siteId).first()
  await requireActor(database,identity,input.tenantId)
  const saved = await row(database,input.requestId)
  if (!saved || saved.inputJson !== json || String(saved.actorUserId) !== identity.userId) throw new SiteManagementError(409,'Request identity, site or owner is unavailable')
  return { ...summary(saved),replayed: !inserted }
}
/** A prepared request is cancellable until the journal reserves its operation.
 * The reservation trigger and this conditional write serialize the race. */
export async function cancelProvisionAdmission(database: D1Database,identity: CentralIdentity,requestId: string) {
  const saved = await readProvisionAdmission(database,identity,requestId)
  await database.prepare(`UPDATE site_provision_requests AS q SET state='cancelled',cancelled_by=?,cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE request_id=? AND state='queued' AND ${provisionActorPermission('?','q.tenant_id')}
      AND EXISTS (SELECT 1 FROM users_sessions s WHERE s._parent_id=? AND s.id=? AND julianday(s.expires_at)>julianday('now'))
      AND NOT EXISTS (SELECT 1 FROM site_provision_operations o WHERE o.operation_id=q.request_id)`)
    .bind(identity.userId,requestId,identity.userId,identity.userId,identity.sessionId).run()
  await requireActor(database,identity,saved.input.tenantId)
  const current = await readProvisionAdmission(database,identity,requestId)
  if (current.state !== 'cancelled') throw new SiteManagementError(409,'Provision execution already owns this request')
  return current
}
