import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export function loadProvisionFleet(path) {
  assert.match(path,/^operations\/fleet\/[a-z0-9-]+\.json$/,'Reviewed fleet source path required')
  const input = JSON.parse(readFileSync(path,'utf8'))
  assert.deepEqual(Object.keys(input).sort(),['groups','operationId'])
  assert.ok(Array.isArray(input.groups) && input.groups.length > 0 && input.groups.length <= 20)
  return { operationId: input.operationId,groups: input.groups.map(group => {
    assert.deepEqual(Object.keys(group).sort(),['baselineSites','requests','workerGroup'])
    assert.ok(Array.isArray(group.requests) && group.requests.length > 0 && group.requests.length <= 50)
    return { ...group,requests: group.requests.map(path => {
      assert.match(path,/^operations\/provision\/[a-z0-9-]+\.json$/,'Reviewed provision source path required')
      return JSON.parse(readFileSync(path,'utf8'))
    }) }
  }) }
}
