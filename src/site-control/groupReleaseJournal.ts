import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { optionalSiteContext } from '../site-runtime/context'
import { provisionDigest,provisionHashSchema,provisionUuidSchema } from './provisionPlan'

const now = "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)"
const groupSchema = z.string().regex(/^[a-z0-9-]{1,64}$/)
export type GroupLease = { workerGroup: string; owner: string; epoch: number }
const receiptSchema = z.object({ releaseId: provisionHashSchema,deploymentId: provisionUuidSchema,versionId: provisionUuidSchema,
  manifestDigest: provisionHashSchema,commit: z.string().regex(/^[a-f0-9]{40}$/) }).strict()
export type GroupReleaseReceipt = z.infer<typeof receiptSchema>
export type GroupReleaseRecord = { releaseId: string; workerGroup: string; commit: string; manifestDigest: string; manifest: string;
  expectedDeploymentId: string; receipt: GroupReleaseReceipt | null; createdAt: string; completedAt: string | null }
export const groupReleaseId = (workerGroup: string,commit: string,manifestDigest: string) => provisionDigest(JSON.stringify({ workerGroup,commit,manifestDigest }))

/** Database-clock group exclusion. Every claim/reservation repeats its checks
 * in the write statement, so a successful preview is never treated as a lock. */
export class GroupReleaseJournal {
  constructor(private database: D1Database) {}
  private central() { if (optionalSiteContext()) throw new Error('Group release is central-only') }
  async read(releaseId: string): Promise<GroupReleaseRecord | null> {
    this.central(); provisionHashSchema.parse(releaseId)
    const row = await this.database.prepare(`SELECT release_id AS releaseId,worker_group AS workerGroup,commit_sha AS "commit",manifest_digest AS manifestDigest,
      manifest_json AS manifest,expected_deployment_id AS expectedDeploymentId,receipt_json AS receipt,created_at AS createdAt,completed_at AS completedAt
      FROM site_group_releases WHERE release_id=?`).bind(releaseId).first<Omit<GroupReleaseRecord,'receipt'> & { receipt: string | null }>()
    return row ? { ...row,receipt: row.receipt ? receiptSchema.parse(JSON.parse(row.receipt)) : null } : null
  }
  async pending(workerGroup: string) {
    this.central(); groupSchema.parse(workerGroup)
    const id = await this.database.prepare('SELECT release_id FROM site_group_releases WHERE worker_group=? AND completed_at IS NULL').bind(workerGroup).first<string>('release_id')
    return id ? this.read(id) : null
  }
  async claim(workerGroup: string): Promise<GroupLease> {
    this.central(); groupSchema.parse(workerGroup)
    const owner = randomUUID()
    const row = await this.database.prepare(`INSERT INTO site_group_leases (worker_group,lease_owner,lease_epoch,lease_until)
      SELECT ?,?,1,${now}+180000 WHERE NOT EXISTS (SELECT 1 FROM site_provision_operations WHERE worker_group=? AND completed_at IS NULL)
        AND ((SELECT COUNT(*) FROM site_group_leases WHERE lease_until>${now})
          + (SELECT COUNT(*) FROM site_provision_operations WHERE completed_at IS NULL AND lease_until>${now})) < 4
      ON CONFLICT(worker_group) DO UPDATE SET lease_owner=excluded.lease_owner,lease_epoch=site_group_leases.lease_epoch+1,lease_until=excluded.lease_until
      WHERE site_group_leases.lease_until<=${now} RETURNING lease_epoch AS epoch`).bind(workerGroup,owner,workerGroup).first<{ epoch: number }>()
    assert.ok(row,'Group release busy, provision pending or global capacity exhausted')
    return { workerGroup,owner,epoch: row.epoch }
  }
  private parameters(lease: GroupLease) {
    this.central(); groupSchema.parse(lease.workerGroup); provisionUuidSchema.parse(lease.owner)
    assert.ok(Number.isSafeInteger(lease.epoch) && lease.epoch > 0)
    return [lease.workerGroup,lease.owner,lease.epoch] as const
  }
  async heartbeat(lease: GroupLease) {
    const row = await this.database.prepare(`UPDATE site_group_leases SET lease_until=${now}+180000
      WHERE worker_group=? AND lease_owner=? AND lease_epoch=? AND lease_until>${now} RETURNING worker_group`).bind(...this.parameters(lease)).first()
    assert.ok(row,'Group release lease lost')
  }
  async release(lease: GroupLease) {
    await this.database.prepare('UPDATE site_group_leases SET lease_until=0 WHERE worker_group=? AND lease_owner=? AND lease_epoch=?').bind(...this.parameters(lease)).run()
  }
  async begin(lease: GroupLease,input: { commit: string; manifest: string; expectedDeploymentId: string }) {
    const params = this.parameters(lease)
    z.string().regex(/^[a-f0-9]{40}$/).parse(input.commit); provisionUuidSchema.parse(input.expectedDeploymentId)
    assert.ok(input.manifest.length < 150000)
    const manifestDigest = provisionDigest(input.manifest),releaseId = groupReleaseId(lease.workerGroup,input.commit,manifestDigest)
    await this.database.prepare(`INSERT INTO site_group_releases
      (release_id,worker_group,commit_sha,manifest_digest,manifest_json,expected_deployment_id,created_at)
      SELECT ?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS (
        SELECT 1 FROM site_group_leases WHERE worker_group=? AND lease_owner=? AND lease_epoch=? AND lease_until>${now})
      ON CONFLICT DO NOTHING`).bind(releaseId,lease.workerGroup,input.commit,manifestDigest,input.manifest,input.expectedDeploymentId,...params).run()
    const row = await this.read(releaseId)
    assert.ok(row && row.workerGroup === lease.workerGroup && row.commit === input.commit && row.manifest === input.manifest && row.manifestDigest === manifestDigest,'Unresolved group release or changed manifest')
    return row
  }
  async uploaded(lease: GroupLease,receipt: GroupReleaseReceipt) {
    const parsed = receiptSchema.parse(receipt),json = JSON.stringify(parsed),row = await this.read(parsed.releaseId)
    assert.ok(row && row.workerGroup === lease.workerGroup && row.commit === parsed.commit && row.manifestDigest === parsed.manifestDigest,'Group release receipt identity mismatch')
    await this.database.prepare(`UPDATE site_group_releases SET receipt_json=? WHERE release_id=? AND receipt_json IS NULL AND EXISTS (
      SELECT 1 FROM site_group_leases WHERE worker_group=? AND lease_owner=? AND lease_epoch=? AND lease_until>${now})`)
      .bind(json,parsed.releaseId,...this.parameters(lease)).run()
    assert.deepEqual((await this.read(parsed.releaseId))?.receipt,parsed,'Group upload receipt conflict or lease lost')
  }
  async finish(lease: GroupLease,releaseId: string) {
    provisionHashSchema.parse(releaseId)
    const row = await this.database.prepare(`UPDATE site_group_releases SET completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE release_id=? AND worker_group=? AND receipt_json IS NOT NULL AND completed_at IS NULL AND EXISTS (
        SELECT 1 FROM site_group_leases WHERE worker_group=? AND lease_owner=? AND lease_epoch=? AND lease_until>${now}) RETURNING release_id`)
      .bind(releaseId,lease.workerGroup,...this.parameters(lease)).first()
    assert.ok(row,'Group release completion conflict or lease lost')
  }
}
