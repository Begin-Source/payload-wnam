import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

if (process.env.WORKERS_CI_BRANCH !== 'feat/site-per-d1') {
  console.log('Cloudflare validation complete; no P0 deployment for this branch')
  process.exit(0)
}
const ACCOUNT = 'd487cf34c606620b442632a72272014d'
const WORKER = 'payload-wnam-p0'
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const marker = JSON.parse(readFileSync('.cloudflare-ci/release.json', 'utf8'))
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_COMMIT_SHA !== commit ||
  marker.commit !== commit || !existsSync('.open-next/worker.js')) throw new Error('P0 requires a successful commit-matched Workers Build')
const config = JSON.parse(readFileSync('wrangler.p0.json', 'utf8'))
const expectedDBs = ['31d5906e-f276-4a61-87c1-31a13e7131e6', '20fd152f-7b7c-4bc6-be81-1a36ea720060']
if (config.name !== WORKER || config.account_id !== ACCOUNT || config.d1_databases.length !== 2 ||
  config.d1_databases.some((db, i) => db.database_id !== expectedDBs[i]) ||
  config.r2_buckets[0].bucket_name !== WORKER || config.triggers ||
  config.queues?.producers?.length !== 1 || config.queues.producers[0].binding !== 'P0_JOBS' ||
  config.queues.producers[0].queue !== 'payload-wnam-p0-jobs' ||
  config.queues.consumers?.length !== 1 || config.queues.consumers[0].queue !== 'payload-wnam-p0-jobs' ||
  config.queues.consumers[0].dead_letter_queue !== 'payload-wnam-p0-dlq') throw new Error('P0 resource configuration mismatch')
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, NODE_ENV: 'production', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
if (env.WRANGLER_CI_MATCH_TAG && env.WRANGLER_CI_MATCH_TAG !== 'a53ec5c30f6f4623909113bf36ca914f') {
  throw new Error('Unexpected source Worker build trigger')
}
// The existing branch trigger belongs to the production Worker. Override its
// implicit name only after the explicit P0 account/resource allowlist passes.
delete env.WRANGLER_CI_OVERRIDE_NAME
delete env.WRANGLER_CI_MATCH_TAG
delete env.PAYLOAD_TEST_MODE
delete env.PAYLOAD_BUILD_PHASE
const token = env.CLOUDFLARE_API_TOKEN
if (!token) throw new Error('Cloudflare Builds token missing')
async function api(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(`P0 preflight failed: ${path} (${response.status})`)
  return data.result
}
const before = await api('workers/scripts/payload-wnam/deployments')
for (const db of config.d1_databases) {
  const actual = await api(`d1/database/${db.database_id}`)
  if (actual.name !== db.database_name || actual.read_replication?.mode !== 'disabled') throw new Error('P0 D1 identity/replication mismatch')
}
await api(`r2/buckets/${WORKER}`)
for (const [id, name] of [['c35fa70b5ed24a078360c57d34ad2ac8', 'payload-wnam-p0-jobs'], ['a762370f446e456d9130dd754ea433f0', 'payload-wnam-p0-dlq']]) {
  const queue = await api(`queues/${id}`)
  if (queue.queue_name !== name) throw new Error('P0 queue identity mismatch')
}
const run = (args, extra = {}) => execFileSync('pnpm', args, { stdio: 'inherit', env: { ...env, ...extra } })
const password = randomBytes(32).toString('hex')
const payloadSecret = randomBytes(32).toString('hex')
const gate = randomBytes(32).toString('hex')
for (const db of config.d1_databases) {
  writeFileSync('.cloudflare-ci/p0-migration.json', JSON.stringify({
    name: WORKER, account_id: ACCOUNT, compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    d1_databases: [{ ...db, binding: 'D1' }], r2_buckets: config.r2_buckets,
  }))
  const maintenance = { PAYLOAD_P0_MIGRATION: '1', PAYLOAD_SECRET: payloadSecret, P0_TEST_PASSWORD: password }
  run(['exec', 'payload', 'run', 'scripts/p0-migrate.ts'], maintenance)
  run(['exec', 'payload', 'run', 'scripts/p0-seed.ts'], maintenance)
}
execFileSync(process.execPath, ['scripts/ci-p0-memory.mjs'], {
  stdio: 'inherit', timeout: 240000,
  env: { ...env, PAYLOAD_SECRET: payloadSecret, P0_GATE_SECRET: gate, P0_TEST_PASSWORD: password },
})
run(['exec', 'opennextjs-cloudflare', 'deploy', '--config', 'wrangler.p0.json'])
execFileSync('pnpm', ['exec', 'wrangler', 'secret', 'bulk', '--config', 'wrangler.p0.json'], {
  env, input: JSON.stringify({ PAYLOAD_SECRET: payloadSecret, P0_GATE_SECRET: gate }), stdio: ['pipe', 'inherit', 'inherit'],
})
const settings = await api(`workers/scripts/${WORKER}/settings`)
for (const db of config.d1_databases) {
  if (!settings.bindings.some(b => b.name === db.binding && b.type === 'd1' && b.id === db.database_id)) throw new Error('Deployed P0 binding mismatch')
}
if (!settings.bindings.some(b => b.name === 'R2' && b.type === 'r2_bucket' && b.bucket_name === WORKER) ||
  !settings.bindings.some(b => b.name === 'P0_JOBS' && b.type === 'queue' && b.queue_name === 'payload-wnam-p0-jobs')) {
  throw new Error('Deployed P0 storage/queue binding mismatch')
}
const after = await api('workers/scripts/payload-wnam/deployments')
if (before.deployments[0].id !== after.deployments[0].id) throw new Error('Production deployment changed during P0 release')
// Secret rotation creates a new deployment. One successful gate POST does not
// establish that subsequent requests on both domains see the new credential.
// Wait for consecutive authenticated, anonymous-admin reads before any smoke
// writes. This is readiness only: the full smoke still runs and gates release.
let consecutiveReady = 0
const readinessStarted = Date.now()
for (let attempt = 1; Date.now() - readinessStarted < 90_000; attempt++) {
  const statuses = await Promise.all(['a','b'].map(async site => {
    try {
      const response = await fetch(`https://p0-${site}.beginos.org/admin/login`,{
        headers: { cookie: `__Host-p0-access=${gate}` },redirect: 'manual',signal: AbortSignal.timeout(10000),
      })
      const ready = response.status === 200 && Boolean(response.headers.get('x-p0-isolate-id'))
      await response.body?.cancel()
      return { site,status: response.status,ready }
    } catch { return { site,status: null,ready: false } }
  }))
  consecutiveReady = statuses.every(result => result.ready) ? consecutiveReady + 1 : 0
  console.log(JSON.stringify({ event: 'p0_deployment_readiness',attempt,consecutiveReady,statuses }))
  if (consecutiveReady >= 4) break
  await new Promise(resolve => setTimeout(resolve,2500))
}
if (consecutiveReady < 4) throw new Error('P0 deployment/secret propagation did not become ready; online smoke not started')
execFileSync(process.execPath, ['scripts/ci-p0-smoke.mjs'], { stdio: 'inherit', env: { ...env, P0_GATE_SECRET: gate, P0_TEST_PASSWORD: password } })
console.log(JSON.stringify({ event: 'p0_release_passed', commit, worker: WORKER, productionUnchanged: before.deployments[0].id }))
