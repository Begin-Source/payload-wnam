import assert from 'node:assert/strict'

const branch = 'feat/site-per-d1'
const commitPattern = /^[a-f0-9]{40}$/
const buildPattern = /^[a-f0-9]{8}-[a-f0-9-]{27,}$/

/** Resolve the checked-out commit after the dispatch selector has bound an
 * otherwise commit-less Deploy Hook build to its durable D1 run. Ordinary
 * push builds continue to use Cloudflare's native commit identity. */
export function workersCiCommit(environment = process.env) {
  assert.equal(environment.WORKERS_CI,'1')
  const selected = environment.P1_DISPATCH_COMMIT_SHA
  if (selected !== undefined) {
    assert.equal(environment.WORKERS_CI_BRANCH,branch)
    assert.match(environment.WORKERS_CI_BUILD_UUID ?? '',buildPattern)
    assert.match(selected,commitPattern)
    return selected
  }
  assert.match(environment.WORKERS_CI_COMMIT_SHA ?? '',commitPattern)
  return environment.WORKERS_CI_COMMIT_SHA
}
