import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { optionalSiteContext } from '../site-runtime/context'
import { provisionDigest, provisionHashSchema, provisionUuidSchema, serializeProvisionPlan, type ProvisionPlan } from './provisionPlan'

export const provisionSteps = ['database','schema','seed','deploy','verify','activate'] as const
export type ProvisionStep = typeof provisionSteps[number]
export type ProvisionLease = Readonly<{ operationId: string; owner: string; epoch: number }>
export type ProvisionOperation = {
  operationId: string; planDigest: string; checkpoint: number; databaseId: string | null;
  leaseEpoch: number; leaseUntil: number; completedAt: string | null;
  pendingStep: number | null
}
type Target = { accountId: string; centralDatabaseId: string }
const now = "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)"
const stepNumber = (step: ProvisionStep) => {
  const number = provisionSteps.indexOf(step)+1
  if (!number) throw new Error('Unknown provision step')
  return number
}
const strictReceipt = {
  database: z.object({ databaseId: provisionUuidSchema,databaseName: z.string(),readReplication: z.literal('disabled') }).strict(),
  schema: z.object({ databaseId: provisionUuidSchema,schemaDigest: provisionHashSchema,schemaVersion: z.number().int().positive(),objects: z.number().int().positive() }).strict(),
  seed: z.object({ databaseId: provisionUuidSchema,siteId: z.string(),localSiteId: z.number().int().positive(),tenantId: z.number().int().positive(),ownerUserId: z.number().int().positive(),contentDigest: provisionHashSchema }).strict(),
  deploy: z.object({ deploymentId: provisionUuidSchema,versionId: provisionUuidSchema,manifestDigest: provisionHashSchema,commit: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
  verify: z.object({ deploymentId: provisionUuidSchema,reportDigest: provisionHashSchema,checkedAt: z.string().datetime() }).strict(),
  activate: z.object({ siteId: z.string(),routingVersion: z.number().int().positive() }).strict(),
}

/** Maintenance-only journal, deliberately not mounted on HTTP/MCP and never
 * given an account API token. External effects must be independently checked
 * by the operator before their receipts are committed. A pending intent is an
 * unknown result, not permission to repeat a resource creation or deployment. */
export class ProvisionJournal {
  constructor(private database: D1Database,private target: Target) {}
  private assertCentral() { if (optionalSiteContext()) throw new Error('Provision maintenance is central-only') }
  private validate(plan: ProvisionPlan) {
    this.assertCentral()
    const json = serializeProvisionPlan(plan)
    if (plan.accountId !== this.target.accountId || plan.centralDatabaseId !== this.target.centralDatabaseId) throw new Error('Provision target mismatch')
    return { json,digest: provisionDigest(json) }
  }
  async read(operationId: string): Promise<ProvisionOperation | null> {
    this.assertCentral(); provisionUuidSchema.parse(operationId)
    return this.database.prepare(`SELECT operation_id AS operationId,plan_digest AS planDigest,checkpoint,
      database_id AS databaseId,lease_epoch AS leaseEpoch,lease_until AS leaseUntil,completed_at AS completedAt,
      (SELECT step FROM site_provision_steps s WHERE s.operation_id=o.operation_id AND s.receipt_json IS NULL) AS pendingStep
      FROM site_provision_operations o WHERE operation_id=?`).bind(operationId).first<ProvisionOperation>()
  }
  async plan(operationId: string): Promise<ProvisionPlan | null> {
    this.assertCentral(); provisionUuidSchema.parse(operationId)
    const row = await this.database.prepare('SELECT plan_json,plan_digest FROM site_provision_operations WHERE operation_id=?')
      .bind(operationId).first<{ plan_json: string; plan_digest: string }>()
    if (!row) return null
    const plan = JSON.parse(row.plan_json) as ProvisionPlan
    if (this.validate(plan).digest !== row.plan_digest) throw new Error('Stored provision plan digest mismatch')
    return Object.freeze(plan)
  }
  async step(operationId: string,step: ProvisionStep) {
    this.assertCentral(); provisionUuidSchema.parse(operationId)
    const row = await this.database.prepare(`SELECT intent_digest AS intentDigest,started_at AS startedAt,receipt_json AS receipt
      FROM site_provision_steps WHERE operation_id=? AND step=?`).bind(operationId,stepNumber(step))
      .first<{ intentDigest: string; startedAt: string; receipt: string | null }>()
    return row ? { ...row,receipt: row.receipt ? JSON.parse(row.receipt) as Record<string,unknown> : null } : null
  }
  /** Read-only preview. It reserves nothing and may become stale immediately. */
  async preview(plan: ProvisionPlan) {
    const { digest } = this.validate(plan), existing = await this.read(plan.operationId)
    if (existing) {
      if (existing.planDigest !== digest) throw new Error('Provision operation ID already has a different plan')
      return { mode: 'resume' as const,operation: existing }
    }
    const conflicts = await this.database.prepare(`SELECT
      (SELECT COUNT(*) FROM site_runtime_registry WHERE site_id=? OR local_site_id=? OR (worker_group=? AND binding_name=?)) AS registered,
      (SELECT COUNT(*) FROM sites WHERE id=? OR runtime_site_id=?) AS siteRecords,
      (SELECT COUNT(*) FROM site_provision_operations WHERE site_id=? OR local_site_id=? OR database_name=? OR (worker_group=? AND completed_at IS NULL) OR (worker_group=? AND binding_name=?)) AS reserved,
      (SELECT COUNT(*) FROM site_runtime_registry WHERE worker_group=?) AS groupSize,
      (SELECT COUNT(*) FROM users WHERE id=?) AS ownerExists,
      (SELECT COUNT(*) FROM tenants WHERE id=?) AS tenantExists`).bind(
      plan.siteId,plan.localSiteId,plan.workerGroup,plan.bindingName,plan.localSiteId,plan.siteId,
      plan.siteId,plan.localSiteId,plan.databaseName,plan.workerGroup,plan.workerGroup,plan.bindingName,
      plan.workerGroup,plan.ownerUserId,plan.tenantId,
    ).first<{ registered: number; siteRecords: number; reserved: number; groupSize: number; ownerExists: number; tenantExists: number }>()
    if (!conflicts || conflicts.registered || conflicts.siteRecords || conflicts.reserved || conflicts.groupSize >= 50 ||
      conflicts.ownerExists !== 1 || conflicts.tenantExists !== 1) throw new Error('Provision target occupied, group full, or owner/tenant missing')
    return { mode: 'new' as const,planDigest: digest,groupSize: conflicts.groupSize }
  }
  async reserve(plan: ProvisionPlan): Promise<ProvisionOperation> {
    const { json,digest } = this.validate(plan)
    // All conflict/capacity conditions are repeated in the write statement;
    // preview is informational and never acts as a lock.
    await this.database.prepare(`INSERT INTO site_provision_operations
      (operation_id,site_id,local_site_id,worker_group,binding_name,database_name,plan_json,plan_digest,created_at)
      SELECT ?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE NOT EXISTS (SELECT 1 FROM site_runtime_registry WHERE site_id=? OR local_site_id=? OR (worker_group=? AND binding_name=?))
        AND NOT EXISTS (SELECT 1 FROM sites WHERE id=? OR runtime_site_id=?)
        AND (SELECT COUNT(*) FROM site_runtime_registry WHERE worker_group=?) < 50
        AND EXISTS (SELECT 1 FROM users WHERE id=?) AND EXISTS (SELECT 1 FROM tenants WHERE id=?)
      ON CONFLICT DO NOTHING`).bind(plan.operationId,plan.siteId,plan.localSiteId,plan.workerGroup,plan.bindingName,plan.databaseName,json,digest,
      plan.siteId,plan.localSiteId,plan.workerGroup,plan.bindingName,plan.localSiteId,plan.siteId,plan.workerGroup,plan.ownerUserId,plan.tenantId).run()
    const stored = await this.read(plan.operationId)
    if (!stored || stored.planDigest !== digest) throw new Error('Provision reservation conflict')
    return stored
  }
  async claim(operationId: string,options: { reconcilePending?: boolean } = {}): Promise<ProvisionLease> {
    this.assertCentral(); provisionUuidSchema.parse(operationId)
    const owner = randomUUID()
    const row = await this.database.prepare(`UPDATE site_provision_operations SET lease_owner=?,lease_epoch=lease_epoch+1,lease_until=${now}+180000
      WHERE operation_id=? AND completed_at IS NULL AND lease_until<=${now}
        AND (SELECT COUNT(*) FROM site_provision_operations WHERE completed_at IS NULL AND lease_until>${now}) < 4
        AND (?=1 OR NOT EXISTS (SELECT 1 FROM site_provision_steps WHERE operation_id=? AND receipt_json IS NULL))
      RETURNING lease_epoch AS epoch`).bind(owner,operationId,Number(options.reconcilePending === true),operationId).first<{ epoch: number }>()
    if (!row) throw new Error('Provision busy, complete, capacity exhausted, or pending effect requires reconciliation')
    return Object.freeze({ operationId,owner,epoch: row.epoch })
  }
  private leaseParams(lease: ProvisionLease) {
    this.assertCentral(); provisionUuidSchema.parse(lease.operationId); provisionUuidSchema.parse(lease.owner)
    if (!Number.isSafeInteger(lease.epoch) || lease.epoch < 1) throw new Error('Invalid provision lease')
    return [lease.operationId,lease.owner,lease.epoch] as const
  }
  async heartbeat(lease: ProvisionLease) {
    const params = this.leaseParams(lease)
    const row = await this.database.prepare(`UPDATE site_provision_operations SET lease_until=${now}+180000
      WHERE operation_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>${now} AND completed_at IS NULL RETURNING operation_id`)
      .bind(...params).first()
    if (!row) throw new Error('Provision lease lost')
  }
  async release(lease: ProvisionLease) {
    const params = this.leaseParams(lease)
    await this.database.prepare('UPDATE site_provision_operations SET lease_owner=NULL,lease_until=0 WHERE operation_id=? AND lease_owner=? AND lease_epoch=?')
      .bind(...params).run()
  }
  async begin(lease: ProvisionLease,step: ProvisionStep,intentDigest: string): Promise<'new' | 'reconcile' | 'completed'> {
    const params = this.leaseParams(lease), number = stepNumber(step)
    provisionHashSchema.parse(intentDigest)
    const inserted = await this.database.prepare(`INSERT INTO site_provision_steps (operation_id,step,intent_digest,started_at)
      SELECT operation_id,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM site_provision_operations
      WHERE operation_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>${now} AND checkpoint=?
      ON CONFLICT DO NOTHING RETURNING operation_id`).bind(number,intentDigest,...params,number-1).first()
    if (inserted) return 'new'
    const prior = await this.database.prepare(`SELECT s.intent_digest,s.receipt_json FROM site_provision_steps s JOIN site_provision_operations o USING(operation_id)
      WHERE o.operation_id=? AND o.lease_owner=? AND o.lease_epoch=? AND o.lease_until>${now} AND s.step=?`)
      .bind(...params,number).first<{ intent_digest: string; receipt_json: string | null }>()
    if (!prior || prior.intent_digest !== intentDigest) throw new Error('Provision lease, step order or intent conflict')
    return prior.receipt_json ? 'completed' : 'reconcile'
  }
  async finish(lease: ProvisionLease,step: ProvisionStep,intentDigest: string,receipt: unknown) {
    const params = this.leaseParams(lease), number = stepNumber(step)
    provisionHashSchema.parse(intentDigest)
    const parsed = strictReceipt[step].parse(receipt), json = JSON.stringify(parsed)
    const row = await this.database.prepare(`SELECT plan_json,database_id FROM site_provision_operations WHERE operation_id=?`)
      .bind(lease.operationId).first<{ plan_json: string; database_id: string | null }>()
    if (!row) throw new Error('Provision operation missing')
    const plan = JSON.parse(row.plan_json) as ProvisionPlan
    this.validate(plan)
    if ('databaseId' in parsed && step !== 'database' && parsed.databaseId !== row.database_id) throw new Error('Provision database mismatch')
    if (step === 'database' && 'databaseName' in parsed && parsed.databaseName !== plan.databaseName) throw new Error('Provision database name mismatch')
    if ('schemaDigest' in parsed && (parsed.schemaDigest !== plan.schemaDigest || parsed.schemaVersion !== plan.schemaVersion)) throw new Error('Provision schema mismatch')
    if ('siteId' in parsed && parsed.siteId !== plan.siteId) throw new Error('Provision site mismatch')
    if ('tenantId' in parsed && (parsed.tenantId !== plan.tenantId || parsed.localSiteId !== plan.localSiteId || parsed.ownerUserId !== plan.ownerUserId)) throw new Error('Provision seed mismatch')
    if (step === 'verify' && 'deploymentId' in parsed) {
      const previous = await this.database.prepare('SELECT receipt_json FROM site_provision_steps WHERE operation_id=? AND step=4')
        .bind(lease.operationId).first<string>('receipt_json')
      if (!previous || JSON.parse(previous).deploymentId !== parsed.deploymentId) throw new Error('Provision verification deployment mismatch')
    }
    const activation = number === 6 ? `AND EXISTS (SELECT 1 FROM site_runtime_registry r JOIN site_runtime_access a ON a.site_id=r.site_id
      WHERE r.site_id=json_extract(o.plan_json,'$.siteId') AND r.local_site_id=json_extract(o.plan_json,'$.localSiteId')
        AND r.database_id=o.database_id AND r.worker_group=json_extract(o.plan_json,'$.workerGroup')
        AND r.binding_name=json_extract(o.plan_json,'$.bindingName') AND r.schema_version=json_extract(o.plan_json,'$.schemaVersion')
        AND r.admin_host=json_extract(o.plan_json,'$.adminHost') AND r.timezone=json_extract(o.plan_json,'$.timezone')
        AND r.operation_id=o.operation_id AND r.migration_state='active' AND r.production_enabled=0
        AND r.routing_version=json_extract(?,'$.routingVersion') AND a.user_id=json_extract(o.plan_json,'$.ownerUserId') AND a.role='manager')` : ''
    // The trigger advances the checkpoint in the same statement/transaction as
    // the receipt. Stale owners cannot record effects or advance the operation.
    const args = [json,lease.operationId,number,intentDigest,...params,number-1,...(number === 6 ? [json] : [])]
    await this.database.prepare(`UPDATE site_provision_steps SET receipt_json=?,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE operation_id=? AND step=? AND intent_digest=? AND receipt_json IS NULL AND EXISTS (
        SELECT 1 FROM site_provision_operations o WHERE o.operation_id=? AND o.lease_owner=? AND o.lease_epoch=?
          AND o.lease_until>${now} AND o.checkpoint=? ${activation})`).bind(...args).run()
    // A lost response may retry exactly this receipt after the final lease was
    // released. It must never change the receipt, even for the same operation.
    const saved = await this.database.prepare('SELECT receipt_json FROM site_provision_steps WHERE operation_id=? AND step=? AND intent_digest=?')
      .bind(lease.operationId,number,intentDigest).first<string>('receipt_json')
    if (saved !== json) throw new Error('Provision receipt conflict, lease lost, or activation not verified')
  }
}
