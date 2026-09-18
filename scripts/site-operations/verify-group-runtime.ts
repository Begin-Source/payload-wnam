import assert from 'node:assert/strict'
import type { GroupReleaseReceipt } from '../../src/site-control/groupReleaseJournal'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { readSiteRegistration } from '../../src/site-control/registry'
import type { inspectSiteRuntime } from '../../src/site-runtime/runtimeInspection'
import { groupRoutes,type GroupManifest } from './manifest'
import { runtimeProofSnapshot } from './runtime-proof'

/** Ordinary release proof for every current member. Provision initialization's
 * single-owner projection check is not valid after other staff have logged in. */
export async function verifyGroupRuntime(manifest: GroupManifest,receipt: GroupReleaseReceipt,database: D1Database,
  inspect: (siteId: string) => ReturnType<typeof inspectSiteRuntime>) {
  assert.equal(receipt.manifestDigest,provisionDigest(JSON.stringify(manifest)),'Group verification manifest changed')
  const reports = []
  for (const route of groupRoutes(manifest)) {
    const registration = await readSiteRegistration(database,route.siteId)
    assert.ok(registration && ['active','paused'].includes(registration.migrationState),'Group member unavailable')
    for (const [key,value] of Object.entries(route)) assert.equal(registration[key as keyof typeof registration],value,'Group member registration changed')
    const proof = runtimeProofSnapshot(await inspect(route.siteId))
    for (const [key,value] of Object.entries({ ...route,workerGroup: manifest.vars.WORKER_GROUP,adminHost: `cms-site-${route.siteId}.beginos.org`,
      routingVersion: registration.routingVersion,state: registration.migrationState,releaseCommit: receipt.commit,releaseId: receipt.releaseId }))
      assert.equal(proof[key as keyof typeof proof],value,'Group runtime proof mismatch')
    assert.equal(registration.workerGroup,manifest.vars.WORKER_GROUP)
    assert.equal(registration.adminHost,proof.adminHost)
    assert.deepEqual(await readSiteRegistration(database,route.siteId),registration,'Group member changed during verification')
    reports.push(proof)
  }
  return reports
}
