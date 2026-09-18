import assert from 'node:assert/strict'
import { z } from 'zod'
import { provisionDigest,provisionHashSchema,provisionUuidSchema } from '../../src/site-control/provisionPlan'
import { parseProvisionFleet,type ResolvedFleet } from './fleet'
import { groupRoutes,parseProvisionRequest,provisionManifest,siteConfig } from './manifest'
import { parseVerificationRequest } from './verify-request'

const artifactSchema = z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/),operationId: provisionUuidSchema,
  groups: z.array(z.object({ workerGroup: z.string(),manifest: siteConfig,manifestDigest: provisionHashSchema,
    history: z.array(z.object({ request: z.unknown(),databaseId: provisionUuidSchema }).strict()).min(1).max(50),
  }).strict()).min(1).max(20) }).strict()

/** Cloud-process handoff only. The producer resolves every receipt and current
 * registration from central D1. Consumers rederive capabilities from history;
 * this file is not a replacement for the release controller's live preflight. */
export function fleetReleaseArtifact(commit: string,fleet: ResolvedFleet) {
  const value = { commit,operationId: fleet.operationId,groups: fleet.groups.map(group => ({ workerGroup: group.workerGroup,
    manifest: group.manifest,manifestDigest: group.manifestDigest,
    history: group.requests.map((request,index) => ({ request,databaseId: group.operations[index].databaseId })),
  })) }
  artifactSchema.parse(value)
  return value
}

export function validateFleetReleaseArtifact(input: unknown,reviewedInput: unknown,commit: string) {
  const artifact = artifactSchema.parse(input),reviewed = parseProvisionFleet(reviewedInput)
  assert.equal(artifact.commit,commit,'Effective fleet belongs to another commit')
  assert.equal(artifact.operationId,reviewed.operationId,'Effective fleet selection changed')
  assert.deepEqual(artifact.groups.map(group => group.workerGroup),reviewed.groups.map(group => group.workerGroup),'Effective group selection changed')
  assert.equal(new Set(artifact.groups.map(group => group.workerGroup)).size,artifact.groups.length)
  const seen = { sites: new Set<string>(),databases: new Set<string>(),localIds: new Set<number>(),operations: new Set<string>(),workers: new Set<string>(),tags: new Set<string>() }
  const first = parseProvisionRequest(reviewed.groups[0].requests[0]),central = first.central
  const groups = artifact.groups.map((group,index) => {
    const source = reviewed.groups[index],initial = parseProvisionRequest(source.requests[0])
    assert.ok(group.history.length >= source.requests.length,'Effective history omits reviewed operations')
    assert.equal(initial.plan.workerGroup,group.workerGroup)
    assert.ok(!seen.workers.has(initial.plan.workerName) && !seen.tags.has(initial.plan.workerTag),'Duplicate Worker ownership')
    assert.notEqual(initial.plan.workerName,central.name); assert.notEqual(initial.plan.workerTag,first.centralWorkerTag)
    seen.workers.add(initial.plan.workerName); seen.tags.add(initial.plan.workerTag)
    let manifest = initial.baseline,latestRequest = initial
    const sites = [...source.baselineSites]
    assert.ok(sites.every(site => site.ownership.kind === 'p1'))
    assert.deepEqual(sites.map(site => site.siteId).sort(),groupRoutes(manifest).map(route => route.siteId).sort())
    for (const [offset,item] of group.history.entries()) {
      const request = parseProvisionRequest(item.request),{ plan } = request
      if (offset < source.requests.length) assert.deepEqual(request,parseProvisionRequest(source.requests[offset]),'Effective history changed a reviewed request')
      assert.deepEqual(request.baseline,manifest,'Effective history has a gap, reordering or changed member')
      assert.deepEqual(request.central,central,'Effective central capabilities changed')
      assert.equal(request.centralWorkerTag,first.centralWorkerTag); assert.equal(request.zoneId,first.zoneId)
      for (const key of ['workerGroup','workerName','workerTag','schemaVersion','schemaDigest'] as const) assert.equal(plan[key],initial.plan[key],`Effective ${key} changed`)
      assert.ok(!seen.operations.has(plan.operationId),'Repeated effective operation'); seen.operations.add(plan.operationId)
      manifest = provisionManifest(request,item.databaseId); latestRequest = request
      sites.push({ siteId: plan.siteId,ownership: { kind: 'provision',operationId: plan.operationId } })
    }
    assert.deepEqual(manifest,group.manifest,'Effective manifest differs from complete history')
    assert.equal(provisionDigest(JSON.stringify(manifest)),group.manifestDigest,'Effective manifest digest changed')
    for (const route of groupRoutes(manifest)) {
      assert.notEqual(route.databaseId,first.plan.centralDatabaseId)
      assert.ok(!seen.sites.has(route.siteId) && !seen.databases.has(route.databaseId) && !seen.localIds.has(route.localSiteId),'Effective cross-group identity conflict')
      seen.sites.add(route.siteId); seen.databases.add(route.databaseId); seen.localIds.add(route.localSiteId)
    }
    const verification = parseVerificationRequest({ operationId: artifact.operationId,central,centralWorkerTag: first.centralWorkerTag,zoneId: first.zoneId,
      group: manifest,workerTag: latestRequest.plan.workerTag,schemaDigest: latestRequest.plan.schemaDigest,
      expectedDeploymentId: latestRequest.plan.expectedDeploymentId,sites })
    return { workerGroup: group.workerGroup,manifest,manifestDigest: group.manifestDigest,latestRequest,verification }
  })
  return { commit,operationId: artifact.operationId,central,groups }
}
