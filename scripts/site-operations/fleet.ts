import assert from 'node:assert/strict'
import { z } from 'zod'
import { ProvisionJournal,provisionSteps } from '../../src/site-control/provisionJournal'
import { provisionDigest,provisionUuidSchema } from '../../src/site-control/provisionPlan'
import { groupRoutes,parseProvisionRequest,provisionManifest } from './manifest'
import { parseVerificationRequest,verificationTarget } from './verify-request'
import { releaseGroup,type ReleaseDependencies } from './release'

const fleetSchema = z.object({ operationId: provisionUuidSchema,groups: z.array(z.object({
  workerGroup: z.string().regex(/^[a-z0-9-]{1,64}$/),baselineSites: z.array(verificationTarget).max(50),
  requests: z.array(z.unknown()).min(1).max(50),
}).strict()).min(1).max(20) }).strict()
type Registration = { siteId: string; localSiteId: number; databaseId: string; bindingName: string; workerGroup: string;
  schemaVersion: number; routingVersion: number; state: string; adminHost: string }
export const parseProvisionFleet = (input: unknown) => fleetSchema.parse(input)

/** Assemble current groups from their ordered, immutable provision history.
 * A request is historical evidence, never an instruction to re-upload its old
 * smaller manifest. No D1/Worker/R2 creation or journal mutation occurs here. */
export async function resolveProvisionFleet(input: unknown,database: D1Database) {
  const parsed = parseProvisionFleet(input)
  const groups = parsed.groups.map(group => ({ ...group,requests: group.requests.map(parseProvisionRequest) }))
  const first = groups[0].requests[0],central = first.central
  assert.equal(new Set(groups.map(group => group.workerGroup)).size,groups.length,'Duplicate fleet group')
  const journal = new ProvisionJournal(database,{ accountId: first.plan.accountId,centralDatabaseId: first.plan.centralDatabaseId })
  const seen = { sites: new Set<string>(),databases: new Set<string>(),localIds: new Set<number>(),workers: new Set<string>(),tags: new Set<string>(),operations: new Set<string>() }
  const resolved = []
  for (const group of groups) {
    const initial = group.requests[0],last = group.requests.at(-1)!
    assert.equal(initial.plan.workerGroup,group.workerGroup)
    assert.ok(initial.plan.workerName !== central.name && initial.plan.workerTag !== first.centralWorkerTag,'Site group aliases central Worker')
    assert.ok(!seen.workers.has(initial.plan.workerName) && !seen.tags.has(initial.plan.workerTag),'Worker belongs to multiple fleet groups')
    seen.workers.add(initial.plan.workerName); seen.tags.add(initial.plan.workerTag)
    let manifest = initial.baseline
    const sites = [...group.baselineSites],operations = []
    assert.deepEqual(sites.map(site => site.siteId).sort(),groupRoutes(manifest).map(route => route.siteId).sort(),'Baseline ownership list must include every baseline site')
    // Require bootstrap evidence for imported baseline provision-owned sites as
    // well; they cannot become unexplained legacy members by omitting a request.
    assert.ok(sites.every(site => site.ownership.kind === 'p1'),'Provision-owned baseline sites must be included in the ordered history')
    for (const request of group.requests) {
      const { plan } = request
      assert.deepEqual(request.central,central,'Fleet central capabilities changed')
      assert.equal(request.centralWorkerTag,first.centralWorkerTag); assert.equal(request.zoneId,first.zoneId)
      assert.equal(plan.workerGroup,group.workerGroup); assert.equal(plan.workerName,initial.plan.workerName)
      assert.equal(plan.workerTag,initial.plan.workerTag); assert.equal(plan.schemaDigest,initial.plan.schemaDigest)
      assert.equal(plan.schemaVersion,initial.plan.schemaVersion,'Mixed schema versions require fleet migration support')
      assert.deepEqual(request.baseline,manifest,'Provision history omits, reorders or alters an existing group member')
      assert.ok(!seen.operations.has(plan.operationId),'Provision operation appears twice'); seen.operations.add(plan.operationId)
      const operation = await journal.read(plan.operationId)
      assert.deepEqual(await journal.plan(plan.operationId),plan,'Fleet request differs from immutable stored plan')
      assert.ok(operation?.databaseId && operation.completedAt && operation.checkpoint === 6 && operation.pendingStep === null,'Fleet provision is not complete')
      const target = provisionManifest(request,operation.databaseId)
      const steps = await Promise.all(provisionSteps.map(async step => ({ step,...await journal.step(plan.operationId,step) })))
      assert.ok(steps.every(step => step.receipt && step.startedAt),'Fleet provision receipt is missing')
      const receipts = Object.fromEntries(steps.map(step => [step.step,step.receipt!]))
      assert.equal(receipts.database.databaseId,operation.databaseId); assert.equal(receipts.database.databaseName,plan.databaseName)
      assert.equal(receipts.database.readReplication,'disabled')
      assert.equal(receipts.schema.databaseId,operation.databaseId); assert.equal(receipts.schema.schemaDigest,plan.schemaDigest)
      assert.equal(receipts.schema.schemaVersion,plan.schemaVersion)
      for (const [key,value] of Object.entries({ databaseId: operation.databaseId,siteId: plan.siteId,localSiteId: plan.localSiteId,tenantId: plan.tenantId,ownerUserId: plan.ownerUserId })) assert.equal(receipts.seed[key],value)
      assert.equal(receipts.deploy.manifestDigest,provisionDigest(JSON.stringify(target)))
      assert.equal(receipts.verify.deploymentId,receipts.deploy.deploymentId); assert.equal(receipts.activate.siteId,plan.siteId)
      assert.ok(Number.isSafeInteger(receipts.activate.routingVersion) && Number(receipts.activate.routingVersion) > 0,'Invalid activation receipt')
      assert.deepEqual(await journal.read(plan.operationId),operation,'Provision changed during fleet assembly')
      sites.push({ siteId: plan.siteId,ownership: { kind: 'provision',operationId: plan.operationId } })
      operations.push({ operationId: plan.operationId,siteId: plan.siteId,databaseId: operation.databaseId,completedAt: operation.completedAt,
        planDigest: operation.planDigest,receiptsDigest: provisionDigest(JSON.stringify(steps)),activationRoutingVersion: Number(receipts.activate.routingVersion) })
      manifest = target
    }
    // Reuse the strict capability/ownership validator; expectedDeploymentId is
    // replaced with an independently observed current deployment by callers.
    const verification = parseVerificationRequest({ operationId: parsed.operationId,central,centralWorkerTag: first.centralWorkerTag,
      zoneId: first.zoneId,group: manifest,workerTag: last.plan.workerTag,schemaDigest: last.plan.schemaDigest,
      expectedDeploymentId: last.plan.expectedDeploymentId,sites })
    const routes = groupRoutes(manifest)
    const registrations = (await database.prepare(`SELECT site_id AS siteId,local_site_id AS localSiteId,database_id AS databaseId,
      binding_name AS bindingName,worker_group AS workerGroup,schema_version AS schemaVersion,routing_version AS routingVersion,
      migration_state AS state,admin_host AS adminHost FROM site_runtime_registry WHERE worker_group=? ORDER BY site_id`)
      .bind(group.workerGroup).all<Registration>()).results
    assert.deepEqual(registrations.map(({ routingVersion: _version,state: _state,...row }) => row),routes.map(route => ({ ...route,
      workerGroup: group.workerGroup,adminHost: `cms-site-${route.siteId}.beginos.org` })).sort((a,b) => a.siteId.localeCompare(b.siteId)),
    'Fleet manifest omits or alters a registered member')
    assert.ok(registrations.every(row => ['active','paused'].includes(row.state) && Number.isSafeInteger(row.routingVersion) && row.routingVersion > 0),'Fleet contains an unavailable site')
    for (const operation of operations) assert.ok(registrations.find(row => row.siteId === operation.siteId)!.routingVersion >= operation.activationRoutingVersion,'Registry predates provision activation')
    for (const route of routes) {
      assert.notEqual(route.databaseId,first.plan.centralDatabaseId,'Site database aliases central storage')
      assert.ok(!seen.sites.has(route.siteId) && !seen.databases.has(route.databaseId) && !seen.localIds.has(route.localSiteId),'Site identity or database appears in multiple groups')
      seen.sites.add(route.siteId); seen.databases.add(route.databaseId); seen.localIds.add(route.localSiteId)
    }
    resolved.push({ workerGroup: group.workerGroup,workerName: last.plan.workerName,workerTag: last.plan.workerTag,manifest,
      manifestDigest: provisionDigest(JSON.stringify(manifest)),verification,latestRequest: last,operations })
  }
  // Public/private buckets may be shared across groups using stable site
  // prefixes, but a bucket must never serve both roles or central storage.
  const publicBuckets = new Set(resolved.flatMap(group => group.manifest.r2_buckets.filter(bucket => bucket.binding === 'SITE_PUBLIC').map(bucket => bucket.bucket_name)))
  const privateBuckets = new Set(resolved.flatMap(group => group.manifest.r2_buckets.filter(bucket => bucket.binding === 'SITE_PRIVATE').map(bucket => bucket.bucket_name)))
  assert.ok([...publicBuckets].every(bucket => !privateBuckets.has(bucket)),'Fleet public/private bucket collision')
  assert.ok(central.r2_buckets.every(bucket => !publicBuckets.has(bucket.bucket_name) && !privateBuckets.has(bucket.bucket_name)),'Fleet bucket aliases central storage')
  return { operationId: parsed.operationId,central,centralWorkerTag: first.centralWorkerTag,zoneId: first.zoneId,groups: resolved }
}
export type ResolvedFleet = Awaited<ReturnType<typeof resolveProvisionFleet>>

/** Ordered batches stop at the first failure. Each group has its own durable
 * upload receipt; reentry reuses earlier completed groups and reconciles the
 * failed group instead of claiming a cross-Worker atomic release. */
export async function releaseProvisionFleet(fleet: ResolvedFleet,commit: string,
  dependencies: (group: ResolvedFleet['groups'][number]) => ReleaseDependencies,
  report: (result: Awaited<ReturnType<typeof releaseGroup>>) => Promise<void>) {
  const results = []
  for (const group of fleet.groups) {
    const result = await releaseGroup(group.workerGroup,commit,JSON.stringify(group.manifest),dependencies(group))
    await report(result); results.push(result)
  }
  return results
}
