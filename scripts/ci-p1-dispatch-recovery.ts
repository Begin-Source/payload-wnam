import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { recoverProvisionDispatch } from '../src/site-control/provisionDispatch'
import { P1_ACCOUNT,p1Manifests } from './p1-manifests.mjs'
import { workersCiCommit } from './workers-ci-identity.mjs'

assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.P1_DISPATCH_RECOVERY,'1')
assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(workersCiCommit(),commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
const operation = JSON.parse(readFileSync('operations/p1-dispatch-recovery.json','utf8')) as {
  enabled: boolean; recoveryId: string; requestId: string; buildUuid: string; attemptCount: number;
  reason: string; reviewedAt: string; evidence: { status: string; outcome: string; triggerSource: string; branch: string }
}
assert.deepEqual(Object.keys(operation).sort(),['attemptCount','buildUuid','enabled','evidence','reason','recoveryId','requestId','reviewedAt'])
assert.equal(typeof operation.enabled,'boolean')
assert.deepEqual(operation.evidence,{ status: 'stopped',outcome: 'fail',triggerSource: 'deploy_hook',branch: 'feat/site-per-d1' })
if (!operation.enabled) {
  console.log(JSON.stringify({ event: 'p1_dispatch_recovery_skipped',reason: 'disabled',recoveryId: operation.recoveryId }))
  process.exit(0)
}
const { central } = p1Manifests(),configPath = '.cloudflare-ci/p1-dispatch-recovery-central.json'
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-p1-dispatch-recovery',account_id: P1_ACCOUNT,
  compatibility_date: central.compatibility_date,compatibility_flags: central.compatibility_flags,
  d1_databases: central.d1_databases.map((database: { binding: string; database_name: string; database_id: string }) => ({ ...database,remote: true })) }))
const proxy = await getPlatformProxy<{ CENTRAL_D1: D1Database }>({ configPath,remoteBindings: true,persist: false })
try {
  const { enabled: _enabled,...recovery } = operation
  const result = await recoverProvisionDispatch(proxy.env.CENTRAL_D1,recovery)
  const report = { event: 'p1_dispatch_recovered',commit,...result }
  writeFileSync('.cloudflare-ci/p1-dispatch-recovery.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally { await proxy.dispose() }
process.exit(0)
