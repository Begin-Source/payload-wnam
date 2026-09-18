import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { p1Manifests } from './p1-manifests.mjs'
import { currentRuntimeSourceDigest } from './p1-runtime-source.mjs'
import { loadProvisionFleet } from './provision-fleet-input.mjs'

export function validateReleaseSelection(selection,sourceDigest) {
  assert.ok(selection && typeof selection === 'object' && !Array.isArray(selection))
  assert.deepEqual(Object.keys(selection).sort(),selection.reconcile ? ['provisionRequest','reconcile'] : ['provisionRequest'])
  if (selection.reconcile) {
    assert.deepEqual(Object.keys(selection.reconcile).sort(),['centralDeploymentId','commit','releaseId','sourceDigest'])
    assert.match(selection.reconcile.centralDeploymentId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
    assert.match(selection.reconcile.commit,/^[a-f0-9]{40}$/)
    assert.match(selection.reconcile.releaseId,/^[a-f0-9]{64}$/)
    assert.match(selection.reconcile.sourceDigest,/^[a-f0-9]{64}$/)
    assert.equal(sourceDigest,selection.reconcile.sourceDigest,'Reconciliation cannot retain a release after runtime source changes')
  }
  assert.match(selection.provisionRequest,/^operations\/provision\/p1-[a-z0-9-]+\.json$/)
  return selection
}
export function p1ReleaseRequest() {
  const selection = JSON.parse(readFileSync('operations/p1-release.json','utf8'))
  validateReleaseSelection(selection,selection?.reconcile ? currentRuntimeSourceDigest() : undefined)
  const request = JSON.parse(readFileSync(selection.provisionRequest,'utf8')),source = p1Manifests()
  assert.deepEqual(request.baseline,source.site,'P1 request baseline must retain the reviewed source group')
  assert.deepEqual(request.central,source.central)
  return { path: selection.provisionRequest,request,reconcile: selection.reconcile }
}

/** Share the strict TS history validator with plain Node cloud entrypoints.
 * Scoped loading avoids a second, weaker JavaScript manifest validator. */
let artifactValidator
export async function readFleetReleaseArtifact(path,reviewed,commit) {
  artifactValidator ??= import('tsx/esm/api').then(({ tsImport }) => tsImport('./site-operations/fleet-artifact.ts',import.meta.url))
  const { validateFleetReleaseArtifact } = await artifactValidator
  return validateFleetReleaseArtifact(JSON.parse(readFileSync(path,'utf8')),reviewed,commit)
}

export async function p1EffectiveManifests() {
  assert.equal(process.env.WORKERS_CI,'1')
  const source = p1Manifests(),{ request } = p1ReleaseRequest()
  const fleet = await readFleetReleaseArtifact('.cloudflare-ci/p1-effective-site.json',loadProvisionFleet('operations/fleet/p1.json'),process.env.WORKERS_CI_COMMIT_SHA)
  assert.equal(fleet.groups.length,1,'P1 owns one reviewed group')
  const managed = fleet.groups[0]
  assert.equal(managed.workerGroup,request.plan.workerGroup)
  assert.equal(managed.manifest.name,source.site.name)
  assert.deepEqual(fleet.central,source.central)
  return { central: fleet.central,site: managed.manifest }
}
