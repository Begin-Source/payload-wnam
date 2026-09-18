import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { p1Manifests, P1_ACCOUNT, P1_ZONE } from './p1-manifests.mjs'
import { p1ReleaseRequest,p1EffectiveManifests } from './p1-release-manifests.mjs'

const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
if (process.env.WRANGLER_CI_MATCH_TAG) assert.equal(process.env.WRANGLER_CI_MATCH_TAG,'a53ec5c30f6f4623909113bf36ca914f')
const configs = p1Manifests()
const request = p1ReleaseRequest() // Check any reviewed reconciliation before P1 writes.
const env = { ...process.env,CLOUDFLARE_ACCOUNT_ID: P1_ACCOUNT,NODE_ENV: 'production',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
for (const key of ['WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','PAYLOAD_TEST_MODE','PAYLOAD_BUILD_PHASE','PAYLOAD_ROLE_BUILD']) delete env[key]
const token = env.CLOUDFLARE_API_TOKEN
assert.ok(token,'Cloudflare Builds token required')
const api = async (path,account = true) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${account ? `accounts/${P1_ACCOUNT}/` : ''}${path}`,{
    headers: { authorization: `Bearer ${token}` },signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(`P1 preflight: ${path} (${response.status})`)
  return result.result
}
const production = (await api('workers/scripts/payload-wnam/deployments')).deployments[0].id
if (request.reconcile) assert.equal((await api(`workers/scripts/${configs.central.name}/deployments`)).deployments[0].id,
  request.reconcile.centralDeploymentId,'Reviewed central runtime is no longer deployed')
const domains = await api('workers/domains')
const zone = await api(`zones/${P1_ZONE}`,false)
assert.equal(zone.name,'beginos.org'); assert.equal(zone.account.id,P1_ACCOUNT)
for (const [role,config] of Object.entries(configs)) {
  assert.ok(existsSync(resolve('.cloudflare-ci/roles',role,'.open-next/worker.js')))
  for (const db of config.d1_databases) {
    const actual = await api(`d1/database/${db.database_id}`)
    assert.equal(actual.name,db.database_name); assert.equal(actual.read_replication?.mode,'disabled')
  }
  for (const bucket of config.r2_buckets) {
    const actual = await api(`r2/buckets/${bucket.bucket_name}`)
    assert.equal(actual.name,bucket.bucket_name); assert.equal(actual.location,'WNAM')
    assert.equal((await api(`r2/buckets/${bucket.bucket_name}/domains/managed`)).enabled,false)
    assert.deepEqual((await api(`r2/buckets/${bucket.bucket_name}/domains/custom`)).domains,[])
  }
  for (const route of config.routes) {
    const domain = domains.find(domain => domain.hostname === route.pattern)
    if (domain) {
      assert.equal(domain.service,config.name); assert.equal(domain.zone_id,P1_ZONE)
    } else {
      const records = await api(`zones/${P1_ZONE}/dns_records?name=${route.pattern}`,false)
      assert.equal(records.length,0,'P1 deploy must not overwrite unrelated DNS')
    }
  }
}
const productionDomain = domains.find(domain => domain.hostname === 'hub.beginos.org')
assert.equal(productionDomain?.service,'payload-wnam')
console.log(JSON.stringify({ event: 'p1_preflight_passed',commit,account: P1_ACCOUNT,production }))
const password = randomBytes(32).toString('hex')
const secrets = { central: randomBytes(32).toString('hex'),site: randomBytes(32).toString('hex') }
execFileSync('pnpm',['exec','payload','run','scripts/p1-bootstrap.ts'],{
  env: { ...env,PAYLOAD_P1_BOOTSTRAP: '1',P1_TEST_PASSWORD: password,P1_CENTRAL_SECRET: secrets.central },stdio: 'inherit',
})
const deployed = []
for (const [role,config] of Object.entries(configs)) {
  if (role === 'site') continue // The provision executor owns its upload and receipt.
  const cwd = resolve('.cloudflare-ci/roles',role), configPath = resolve(cwd,'wrangler.p1.jsonc')
  if (!request.reconcile) {
    writeFileSync(configPath,JSON.stringify(config,null,2))
    // Reuse the exact role artifacts that passed this commit's browser checks.
    // No role rebuild, no legacy shared-app upload and no implicit CI Worker name.
    execFileSync('pnpm',['exec','opennextjs-cloudflare','deploy','--config',configPath],{ cwd,env,stdio: 'inherit' })
    execFileSync('pnpm',['exec','wrangler','secret','bulk','--config',configPath],{
      cwd,env,input: JSON.stringify({ PAYLOAD_SECRET: secrets[role] }),stdio: ['pipe','inherit','inherit'],
    })
  }
  const settings = await api(`workers/scripts/${config.name}/settings`)
  for (const db of config.d1_databases) assert.ok(settings.bindings.some(b => b.name === db.binding && b.type === 'd1' && b.id === db.database_id))
  for (const bucket of config.r2_buckets) assert.ok(settings.bindings.some(b => b.name === bucket.binding && b.type === 'r2_bucket' && b.bucket_name === bucket.bucket_name))
  for (const service of config.services ?? []) assert.ok(settings.bindings.some(b => b.name === service.binding && b.type === 'service' && b.service === service.service && b.entrypoint === service.entrypoint))
  assert.ok(settings.bindings.some(b => b.name === 'CENTRAL_ORIGIN' && b.text === config.vars.CENTRAL_ORIGIN))
  const deployment = (await api(`workers/scripts/${config.name}/deployments`)).deployments[0]
  if (request.reconcile) assert.equal(deployment.id,request.reconcile.centralDeploymentId)
  deployed.push({ role,worker: config.name,deployment: deployment.id,versions: deployment.versions,retained: Boolean(request.reconcile) })
  console.log(JSON.stringify({ event: request.reconcile ? 'p1_role_retained' : 'p1_role_deployed',...deployed.at(-1) }))
}
// Wait for actual HTTPS/TLS/domain and secret propagation, then run the full
// smoke once. Readiness retries make no content changes.
let ready = 0
for (let attempt = 1; attempt <= 96; attempt++) {
  const statuses = await Promise.all(['p1-hub.beginos.org','cms-site-p1-a.beginos.org','cms-site-p1-b.beginos.org'].map(async host => {
    try {
      const r = await fetch(`https://${host}/admin/login`,{ redirect: 'manual',signal: AbortSignal.timeout(10000) })
      const ok = host === 'p1-hub.beginos.org' ? r.status === 200 : r.status === 303 && r.headers.get('location') === 'https://p1-hub.beginos.org/admin'
      await r.body?.cancel(); return { host,status: r.status,ok }
    } catch (error) {
      // New custom domains can outlive a resolver's negative-cache TTL. Keep
      // normal certificate validation and DNS; report bounded public-host
      // diagnostics so TLS/lookup errors cannot be mistaken for app readiness.
      const dns = await lookup(host,{ all: true }).then(addresses => ({ addresses }),failure => ({ code: failure.code }))
      return { host,status: null,ok: false,error: String(error.cause?.code ?? error.code ?? error.name),
        reason: String(error.cause?.message ?? error.message).slice(0,180),dns }
    }
  }))
  ready = statuses.every(status => status.ok) ? ready + 1 : 0
  console.log(JSON.stringify({ event: 'p1_readiness',attempt,ready,statuses }))
  if (ready >= 3) break
  await new Promise(resolve => setTimeout(resolve,5000))
}
assert.ok(ready >= 3,'P1 HTTPS deployment did not become ready; forward recovery required')
// A normal push build has no matching dispatch UUID and this remains read-only.
// A Deploy Hook build executes exactly its durable synthetic P1 admission.
execFileSync('pnpm',['exec','payload','run','scripts/ci-p1-auto-provision.ts'],{
  env: { ...env,P1_AUTO_PROVISION: '1',P1_TEST_PASSWORD: password },stdio: 'inherit',
})
// Ordinary releases resolve completed D and every later admission from central
// history. Re-running a historical provision would reject the expanded group.
execFileSync('pnpm',['exec','payload','run','scripts/ci-p1-group-release.ts'],{
  env: { ...env,P1_GROUP_RELEASE: '1',P1_TEST_PASSWORD: password },stdio: 'inherit',
})
const groupRelease = JSON.parse(readFileSync('.cloudflare-ci/p1-group-release.json','utf8'))
deployed.push({ role: 'site',worker: configs.site.name,deployment: groupRelease.receipt.deploymentId,
  versions: [{ version_id: groupRelease.receipt.versionId,percentage: 100 }],retained: Boolean(request.reconcile),runtimeCommit: groupRelease.receipt.commit })
const deployedDomains = await api('workers/domains')
for (const config of Object.values(await p1EffectiveManifests())) for (const route of config.routes) {
  const actual = deployedDomains.find(domain => domain.hostname === route.pattern)
  assert.equal(actual?.service,config.name); assert.equal(actual?.zone_id,P1_ZONE)
}
assert.equal(deployedDomains.find(domain => domain.hostname === 'hub.beginos.org')?.service,'payload-wnam')

assert.equal((await api('workers/scripts/payload-wnam/deployments')).deployments[0].id,production)
if (request.reconcile) assert.equal((await api(`workers/scripts/${configs.central.name}/deployments`)).deployments[0].id,request.reconcile.centralDeploymentId)
const report = { event: 'p1_release_passed',commit,checkedAt: new Date().toISOString(),deployed,productionUnchanged: production }
writeFileSync('.cloudflare-ci/p1-release.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
