import assert from 'node:assert/strict'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionUuidSchema } from '../../src/site-control/provisionPlan'
import { prepareProvisionAdmission,readPreparedProvisionAdmission } from './admission'
import { resolveAdmissionFleet } from './admission-fleet'
import { groupRoutes,parseProvisionRequest } from './manifest'
import { parseProvisionFleet,type ResolvedFleet } from './fleet'

type Group = ResolvedFleet['groups'][number]
export type AdmissionPlannerDependencies = {
  database: D1Database
  fleetInput: unknown
  schema: { version: number; digest: string }
  /** Adapter must check actual account/resource ownership and complete runtime
   * bindings, then return the current deployed identity for this exact group. */
  inspect: (group: Group) => Promise<{ deploymentId: string; manifestDigest: string }>
}

/** Explicit cloud-maintenance selection; the browser cannot select resources.
 * Prepared/started operations reuse their immutable request without rebuilding
 * a baseline from a fleet which might already include their own new site.
 * Actual external effects remain behind the existing executor's preflight,
 * reservation, leases and six-step receipts. */
export async function planProvisionAdmission(requestId: string,workerGroup: string,deps: AdmissionPlannerDependencies) {
  provisionUuidSchema.parse(requestId)
  assert.match(workerGroup,/^[a-z0-9-]{1,64}$/,'Explicit reviewed group required')
  const selected = parseProvisionFleet(deps.fleetInput).groups.find(group => group.workerGroup === workerGroup)
  assert.ok(selected,'Group is not in the reviewed fleet')
  const saved = await readPreparedProvisionAdmission(deps.database,requestId)
  if (saved.request) {
    const reviewed = parseProvisionRequest(selected.requests[0])
    assert.equal(saved.request.plan.workerGroup,workerGroup,'Prepared request belongs to another group')
    assert.equal(saved.request.plan.workerName,reviewed.plan.workerName,'Prepared Worker changed')
    assert.equal(saved.request.plan.workerTag,reviewed.plan.workerTag,'Prepared Worker tag changed')
    assert.deepEqual(saved.request.central,reviewed.central,'Prepared central capabilities changed')
    assert.equal(saved.request.centralWorkerTag,reviewed.centralWorkerTag)
    assert.equal(saved.request.zoneId,reviewed.zoneId)
    assert.equal(saved.request.plan.schemaVersion,deps.schema.version,'Prepared request schema version changed')
    assert.equal(saved.request.plan.schemaDigest,deps.schema.digest,'Prepared request schema digest changed')
    return { request: saved.request,raw: saved.raw,reused: true }
  }
  const fleet = await resolveAdmissionFleet(deps.fleetInput,deps.database)
  const group = fleet.groups.find(group => group.workerGroup === workerGroup)
  assert.ok(group,'Group is not in the reviewed fleet')
  assert.ok(groupRoutes(group.manifest).length < 50,'Group is full')
  const base = group.latestRequest.plan
  assert.equal(base.schemaVersion,deps.schema.version,'Group requires a schema migration')
  assert.equal(base.schemaDigest,deps.schema.digest,'Group schema differs from checked artifact')
  const current = await deps.inspect(group)
  provisionUuidSchema.parse(current.deploymentId)
  assert.equal(current.manifestDigest,group.manifestDigest,'Deployed group differs from complete fleet')
  const { requestId: operationId,...human } = saved.input
  const raw = { plan: { operationId,...human,localSiteId: saved.localSiteId,
    accountId: base.accountId,centralDatabaseId: base.centralDatabaseId,centralOrigin: base.centralOrigin,
    workerGroup,workerName: group.workerName,workerTag: group.workerTag,expectedDeploymentId: current.deploymentId,
    baselineManifestDigest: group.manifestDigest,bindingName: `SITE_D1_${operationId.replaceAll('-','').toUpperCase()}`,
    schemaVersion: deps.schema.version,schemaDigest: deps.schema.digest },baseline: group.manifest,central: fleet.central,
    centralWorkerTag: fleet.centralWorkerTag,zoneId: fleet.zoneId }
  const request = parseProvisionRequest(raw),journal = new ProvisionJournal(deps.database,request.plan)
  await journal.preview(request.plan)
  // The external inspection yielded; do not save a plan over a concurrently
  // completed member. Reservation/execution repeat their own atomic guards.
  assert.deepEqual(await resolveAdmissionFleet(deps.fleetInput,deps.database),fleet,'Fleet changed while planning')
  await prepareProvisionAdmission(deps.database,raw)
  return { request,raw,reused: false }
}
