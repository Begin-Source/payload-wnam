import { describe,expect,it } from 'vitest'
import { workersCiCommit } from '../../scripts/workers-ci-identity.mjs'

const commit = 'a'.repeat(40)
describe('Cloudflare build commit identity',() => {
  it('retains the native commit for ordinary builds',() => {
    expect(workersCiCommit({ WORKERS_CI: '1',WORKERS_CI_COMMIT_SHA: commit })).toBe(commit)
  })
  it('accepts a selected commit-less Deploy Hook build',() => {
    expect(workersCiCommit({ WORKERS_CI: '1',WORKERS_CI_COMMIT_SHA: '',WORKERS_CI_BRANCH: 'feat/site-per-d1',
      WORKERS_CI_BUILD_UUID: '11111111-1111-4111-8111-111111111111',P1_DISPATCH_COMMIT_SHA: commit })).toBe(commit)
  })
  it('rejects an unbound or malformed override',() => {
    expect(() => workersCiCommit({ WORKERS_CI: '1',WORKERS_CI_COMMIT_SHA: '' })).toThrow()
    expect(() => workersCiCommit({ WORKERS_CI: '1',WORKERS_CI_BRANCH: 'main',
      WORKERS_CI_BUILD_UUID: '11111111-1111-4111-8111-111111111111',P1_DISPATCH_COMMIT_SHA: commit })).toThrow()
  })
})
