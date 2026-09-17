import assert from 'node:assert/strict'
import { ProvisionJournal, type ProvisionLease } from '../../src/site-control/provisionJournal'
import { provisionDigest, provisionHashSchema, type ProvisionPlan } from '../../src/site-control/provisionPlan'
import { readSiteRegistration } from '../../src/site-control/registry'

export type GroupDeployment = { deploymentId: string; versionId: string; manifestDigest: string; commit: string }
export type FinishDependencies = {
  journal: ProvisionJournal; centralDatabase: D1Database; manifestDigest: string;
  preflight: () => Promise<void>;
  currentDeployment: () => Promise<(GroupDeployment & { operationId: string }) | null>;
  deploy: (guard: () => Promise<void>) => Promise<void>;
  verify: (deployment: GroupDeployment) => Promise<Record<string,unknown>>;
  acceptance: () => Promise<void>;
  afterDeploy?: () => Promise<void>;
}
const now = "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)"

/** Journal-fenced activation/recovery. Returning to provisioning distinguishes
 * operator recovery from a human pause; ordinary lifecycle APIs cannot resume it.
 * Route version and session invalidation commit in one native D1 batch. */
async function moveRoute(database: D1Database,plan: ProvisionPlan,lease: ProvisionLease,expectedVersion: number,state: 'active' | 'provisioning') {
  const source = state === 'active' ? 'provisioning' : 'active',next = expectedVersion+1
  const results = await database.batch([
    database.prepare(`UPDATE site_runtime_registry SET migration_state=?,routing_version=?
      WHERE site_id=? AND operation_id=? AND routing_version=? AND migration_state=? AND production_enabled=0
        AND EXISTS (SELECT 1 FROM site_provision_operations o JOIN site_provision_steps s USING(operation_id)
          WHERE o.operation_id=? AND o.lease_owner=? AND o.lease_epoch=? AND o.lease_until>${now}
            AND o.checkpoint=5 AND s.step=6 AND s.receipt_json IS NULL)
        AND (?=1 OR EXISTS (SELECT 1 FROM site_runtime_access WHERE site_id=? AND user_id=? AND role='manager'))
      RETURNING routing_version AS version`).bind(state,next,plan.siteId,plan.operationId,expectedVersion,source,
      lease.operationId,lease.owner,lease.epoch,Number(state === 'provisioning'),plan.siteId,String(plan.ownerUserId)),
    ...['site_login_tickets','site_login_sessions'].map(table => database.prepare(`DELETE FROM ${table} WHERE site_id=? AND EXISTS
      (SELECT 1 FROM site_runtime_registry WHERE site_id=? AND operation_id=? AND routing_version=? AND migration_state=?)`)
      .bind(plan.siteId,plan.siteId,plan.operationId,next,state)),
  ])
  assert.equal((results[0].results[0] as { version?: number } | undefined)?.version,next,'Provision route changed or lease lost')
  return next
}

/** Finish the same operation. An unknown upload is reconciled by its deployed
 * provenance and exact manifest; missing evidence never causes a second upload.
 * Successful historical receipts are immutable across later CI commits. */
export async function finishProvisionedSite(plan: ProvisionPlan,mode: 'dry-run' | 'apply',deps: FinishDependencies) {
  assert.ok(['dry-run','apply'].includes(mode),'Explicit finish mode required')
  provisionHashSchema.parse(deps.manifestDigest)
  await deps.preflight()
  const { journal,centralDatabase: database } = deps,preview = await journal.preview(plan)
  assert.ok(preview.mode === 'resume' && preview.operation.databaseId && preview.operation.checkpoint >= 3,'Provision seed must be complete')
  const operation = preview.operation
  const registration = async () => {
    const row = await readSiteRegistration(database,plan.siteId)
    assert.ok(row,'Provision registration missing')
    for (const [key,value] of Object.entries({ siteId: plan.siteId,localSiteId: plan.localSiteId,databaseId: operation.databaseId,
      bindingName: plan.bindingName,workerGroup: plan.workerGroup,adminHost: plan.adminHost,schemaVersion: plan.schemaVersion,
      timezone: plan.timezone,productionEnabled: false,operationId: plan.operationId })) {
      assert.equal(row[key as keyof typeof row],value,'Provision registration identity changed')
    }
    assert.equal(await database.prepare('SELECT role FROM site_runtime_access WHERE site_id=? AND user_id=?').bind(plan.siteId,String(plan.ownerUserId)).first('role'),'manager','Provision owner grant changed')
    return row
  }
  await registration()
  if (mode === 'dry-run') return { operationId: plan.operationId,checkpoint: operation.checkpoint,mutations: false,complete: Boolean(operation.completedAt) }
  if (operation.completedAt) return { operationId: plan.operationId,checkpoint: 6,mutations: false,complete: true }
  const lease = await journal.claim(plan.operationId,{ reconcilePending: true })
  let failed = false,heartbeat = Promise.resolve(),activatedVersion: number | undefined
  const guard = async () => { if (failed) throw new Error('Provision heartbeat failed'); await journal.heartbeat(lease) }
  const timer = setInterval(() => { heartbeat = heartbeat.then(guard).catch(() => { failed = true }) },30000)
  timer.unref()
  try {
    const deployIntent = provisionDigest(JSON.stringify({ operationId: plan.operationId,workerTag: plan.workerTag,manifestDigest: deps.manifestDigest }))
    const state = await journal.begin(lease,'deploy',deployIntent)
    if (state === 'new') {
      assert.equal(await deps.currentDeployment(),null,'Refusing an unrecorded provision deployment')
      await guard(); await deps.deploy(guard); await deps.afterDeploy?.()
    }
    const actual = await deps.currentDeployment()
    assert.ok(actual && actual.operationId === plan.operationId && actual.manifestDigest === deps.manifestDigest,'Provision deployment result unknown; upload was not replayed')
    const { operationId: _operation,...deployment } = actual
    const previous = await journal.step(plan.operationId,'deploy')
    if (previous?.receipt) assert.deepEqual(previous.receipt,deployment,'Provision deployment changed since receipt')
    await guard(); await journal.finish(lease,'deploy',deployIntent,deployment)
    const verifyIntent = provisionDigest(JSON.stringify({ operationId: plan.operationId,...deployment }))
    await journal.begin(lease,'verify',verifyIntent)
    const verified = await deps.verify(deployment)
    const priorVerify = await journal.step(plan.operationId,'verify')
    await guard(); await journal.finish(lease,'verify',verifyIntent,priorVerify?.receipt ?? {
      deploymentId: deployment.deploymentId,reportDigest: provisionDigest(JSON.stringify(verified)),checkedAt: new Date().toISOString(),
    })
    const activateIntent = provisionDigest(JSON.stringify({ operationId: plan.operationId,siteId: plan.siteId,deploymentId: deployment.deploymentId }))
    const activation = await journal.begin(lease,'activate',activateIntent)
    assert.notEqual(activation,'completed')
    const route = await registration()
    assert.ok(route.migrationState === 'provisioning' || activation === 'reconcile' && route.migrationState === 'active','Provision activation state changed')
    await guard()
    activatedVersion = route.migrationState === 'active' ? route.routingVersion : await moveRoute(database,plan,lease,route.routingVersion,'active')
    try {
      await deps.acceptance()
      await guard()
      assert.deepEqual(await deps.currentDeployment(),actual,'Group deployment changed during acceptance')
      const final = await registration()
      assert.equal(final.migrationState,'active'); assert.equal(final.routingVersion,activatedVersion)
      await deps.verify(deployment)
    } catch (error) {
      await guard()
      const version = await moveRoute(database,plan,lease,activatedVersion,'provisioning')
      console.log(JSON.stringify({ event: 'provision_activation_recovered',operationId: plan.operationId,siteId: plan.siteId,routingVersion: version,state: 'provisioning' }))
      activatedVersion = undefined
      throw error
    }
    clearInterval(timer); await heartbeat; await guard()
    await journal.finish(lease,'activate',activateIntent,{ siteId: plan.siteId,routingVersion: activatedVersion })
    return { operationId: plan.operationId,checkpoint: 6,mutations: true,complete: true,deployment,routingVersion: activatedVersion }
  } finally { clearInterval(timer); await heartbeat; await journal.release(lease) }
}
