import assert from 'node:assert/strict'

/** Reviewed synthetic P1 operation, separate from ordinary runtime releases. */
export function validateP1AdmissionSelection(value,sourceDigest) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(),['centralCommit','centralDeploymentId','fleetPath','request','sourceDigest','workerGroup'])
  assert.equal(value.workerGroup,'p1-group-1'); assert.equal(value.fleetPath,'operations/fleet/p1.json')
  assert.match(value.centralDeploymentId,/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.match(value.centralCommit,/^[a-f0-9]{40}$/); assert.match(value.sourceDigest,/^[a-f0-9]{64}$/)
  assert.equal(value.sourceDigest,sourceDigest,'Admission operation cannot retain changed runtime source')
  const request = value.request
  assert.ok(request && typeof request === 'object' && !Array.isArray(request))
  assert.deepEqual(Object.keys(request).sort(),['name','ownerUserId','requestId','siteId','tenantId','timezone'])
  assert.match(request.requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.match(request.siteId,/^p1-[a-z0-9](?:[a-z0-9-]{0,42}[a-z0-9])?$/)
  assert.ok(!['p1-a','p1-b','p1-c','p1-d'].includes(request.siteId),'Original site IDs are reserved')
  assert.ok(typeof request.name === 'string' && request.name.trim() === request.name && request.name.length > 0 && request.name.length <= 120)
  assert.ok([1,2].includes(request.tenantId)); assert.equal(request.ownerUserId,7,'P1 owns only the synthetic test account')
  assert.ok(typeof request.timezone === 'string' && request.timezone.length <= 64)
  new Intl.DateTimeFormat('en',{ timeZone: request.timezone })
  return value
}
