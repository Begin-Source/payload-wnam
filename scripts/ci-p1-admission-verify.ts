import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { p1ReleaseRequest } from './p1-release-manifests.mjs'
import { loadProvisionFleet } from './provision-fleet-input.mjs'
import { resolveAdmissionFleet } from './site-operations/admission-fleet'
import { ProvisionCloudflare } from './site-operations/cloudflare'
import { ProvisionGroup } from './site-operations/group'
import { fleetReleaseArtifact } from './site-operations/fleet-artifact'
import { verifyGroupRuntime } from './site-operations/verify-group-runtime'
import type { inspectSiteRuntime } from '../src/site-runtime/runtimeInspection'

assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME,undefined); assert.equal(process.env.WRANGLER_CI_MATCH_TAG,undefined)
const { admission,request } = p1ReleaseRequest()
assert.ok(admission)
const { central,baseline,plan } = request
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,plan.accountId)
const configPath = '.cloudflare-ci/admission-verification-proxy.json'
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-admission-verification',account_id: plan.accountId,
  compatibility_date: baseline.compatibility_date,compatibility_flags: baseline.compatibility_flags,
  d1_databases: central.d1_databases.map((db: Record<string,unknown>) => ({ ...db,remote: true })),
  services: [{ binding: 'INSPECT',service: plan.workerName,entrypoint: 'SiteProvisionInspectionService',remote: true }] }))
type Environment = { CENTRAL_D1: D1Database; INSPECT: { verify: (siteId: string) => ReturnType<typeof inspectSiteRuntime> } }
const proxy = await getPlatformProxy<Environment>({ configPath,remoteBindings: true,persist: false })
try {
  const fleetInput = loadProvisionFleet(admission.fleetPath),fleet = await resolveAdmissionFleet(fleetInput,proxy.env.CENTRAL_D1)
  assert.equal(fleet.groups.length,1)
  const managed = fleet.groups[0]
  assert.equal(managed.workerGroup,admission.workerGroup)
  assert.equal(managed.latestRequest.plan.operationId,admission.request.requestId,'Admission is not the current completed operation')
  const api = new ProvisionCloudflare(plan.accountId,process.env.CLOUDFLARE_API_TOKEN ?? '')
  const group = new ProvisionGroup(api,managed.latestRequest)
  await group.resources(managed.manifest)
  const before = await group.releaseSnapshot(managed.manifest)
  const proofs = await verifyGroupRuntime(managed.manifest,before,proxy.env.CENTRAL_D1,siteId => proxy.env.INSPECT.verify(siteId))
  assert.deepEqual(await group.releaseSnapshot(managed.manifest),before)
  assert.deepEqual(await resolveAdmissionFleet(fleetInput,proxy.env.CENTRAL_D1),fleet)
  writeFileSync('.cloudflare-ci/p1-effective-site.json',JSON.stringify(fleetReleaseArtifact(commit,fleet),null,2))
  console.log(JSON.stringify({ event: 'p1_admission_fleet_verified',checkedAt: new Date().toISOString(),commit,
    requestId: admission.request.requestId,manifestDigest: managed.manifestDigest,deployment: before,proofs,operations: managed.operations,mutations: false }))
} finally { await proxy.dispose() }
process.exit(0)
