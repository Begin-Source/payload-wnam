import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { selectProvisionBuildExecution } from '../src/site-control/provisionDispatch'
import { P1_ACCOUNT,p1Manifests } from './p1-manifests.mjs'

assert.equal(process.env.WORKERS_CI,'1')
assert.equal(process.env.P1_DISPATCH_SELECTION,'1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
const buildUuid = process.env.WORKERS_CI_BUILD_UUID,branch = process.env.WORKERS_CI_BRANCH
assert.match(buildUuid ?? '',/^[a-f0-9]{8}-[a-f0-9-]{27,}$/)
assert.equal(branch,'feat/site-per-d1')
const { central } = p1Manifests()
const configPath = '.cloudflare-ci/p1-dispatch-selection-central.json'
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-p1-dispatch-selection',account_id: P1_ACCOUNT,
  compatibility_date: central.compatibility_date,compatibility_flags: central.compatibility_flags,
  d1_databases: central.d1_databases.map((database: { binding: string; database_name: string; database_id: string }) => ({ ...database,remote: true })) }))
const proxy = await getPlatformProxy<{ CENTRAL_D1: D1Database }>({ configPath,remoteBindings: true,persist: false })
try {
  const installed = await proxy.env.CENTRAL_D1.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='site_provision_dispatch_runs'").first('name')
  const selected = installed ? await selectProvisionBuildExecution(proxy.env.CENTRAL_D1,{ buildUuid,branch,commit }) : null
  const report = { event: 'p1_dispatch_build_selected',buildUuid,branch,commit,selected }
  writeFileSync('.cloudflare-ci/p1-dispatch-selection.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally { await proxy.dispose() }
process.exit(0)
