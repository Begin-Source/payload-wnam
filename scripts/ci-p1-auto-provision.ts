import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { selectProvisionBuildExecution } from '../src/site-control/provisionDispatch'
import { P1_ACCOUNT,P1_EMAIL,p1Manifests } from './p1-manifests.mjs'

assert.equal(process.env.WORKERS_CI,'1')
assert.equal(process.env.P1_AUTO_PROVISION,'1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
const buildUuid = process.env.WORKERS_CI_BUILD_UUID,branch = process.env.WORKERS_CI_BRANCH
assert.match(buildUuid ?? '',/^[a-f0-9]{8}-[a-f0-9-]{27,}$/)
assert.equal(branch,'feat/site-per-d1')
const { central } = p1Manifests()
writeFileSync('.cloudflare-ci/p1-auto-provision-central.json',JSON.stringify({
  name: 'payload-wnam-p1-auto-provision',account_id: P1_ACCOUNT,
  compatibility_date: central.compatibility_date,compatibility_flags: central.compatibility_flags,
  d1_databases: central.d1_databases.map((database: { binding: string; database_name: string; database_id: string }) => ({ ...database,remote: true })),
}))
const proxy = await getPlatformProxy<{ CENTRAL_D1: D1Database }>({
  configPath: '.cloudflare-ci/p1-auto-provision-central.json',remoteBindings: true,persist: false,
})
try {
  const selected = await selectProvisionBuildExecution(proxy.env.CENTRAL_D1,{ buildUuid,branch,commit })
  if (!selected) {
    console.log(JSON.stringify({ event: 'p1_auto_provision_not_selected',buildUuid,branch,commit }))
  } else {
    const password = process.env.P1_TEST_PASSWORD
    assert.ok(password && password.length >= 32,'Synthetic P1 acceptance credential unavailable')
    execFileSync(process.execPath,['scripts/site-provision.mjs','--request-id',selected.requestId,
      '--group','p1-group-1','--fleet','operations/fleet/p1.json','--apply'],{
      env: { ...process.env,SITE_PROVISION_EMAIL: P1_EMAIL,SITE_PROVISION_PASSWORD: password },stdio: 'inherit',
    })
    const completed = await proxy.env.CENTRAL_D1.prepare(`SELECT o.completed_at AS completedAt,r.state,r.build_uuid AS buildUuid
      FROM site_provision_operations o JOIN site_provision_dispatch_runs r ON r.request_id=o.operation_id
      WHERE o.operation_id=?`).bind(selected.requestId).first<{ completedAt: string | null; state: string; buildUuid: string }>()
    assert.ok(completed?.completedAt && completed.buildUuid === buildUuid && ['running','needs_review','succeeded'].includes(completed.state),
      'Automatic provision completion receipt unavailable')
    console.log(JSON.stringify({ event: 'p1_auto_provision_completed',...selected,completedAt: completed.completedAt,dispatchState: completed.state }))
  }
} finally { await proxy.dispose() }
process.exit(0)
