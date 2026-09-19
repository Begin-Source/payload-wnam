import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ACCOUNT = 'd487cf34c606620b442632a72272014d'
const WORKER = 'payload-wnam'
const DATABASE = 'f2aac41b-418d-47de-8bb3-edda485b1e2b'
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const reportStage = async stage => {
  try {
    await fetch(`https://agenthub.beginos.org/__ci-stage/${commit}/deploy-${stage}`, {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126 Safari/537.36', 'x-agenthub-ci-stage': '1' },
      redirect: 'manual', signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Read-only diagnostics must never replace or weaken a deploy gate.
  }
}
const marker = JSON.parse(readFileSync('.cloudflare-ci/release.json', 'utf8'))
if (marker.commit !== commit || !existsSync('.open-next/worker.js')) {
  throw new Error('No successful Cloudflare build for this commit. Run ci:build in Workers Builds.')
}
if (!process.env.CI) throw new Error('Production deploy must run in Cloudflare Builds.')
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) {
  throw new Error('Cloudflare account mismatch')
}
process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT
delete process.env.PAYLOAD_TEST_MODE
delete process.env.PAYLOAD_BUILD_PHASE

async function api(path) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('Cloudflare build API token missing')
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(`Release preflight failed: ${path} (${res.status})`)
  return data.result
}
const settings = await api(`workers/scripts/${WORKER}/settings`)
if (!settings.bindings.some(b => b.type === 'd1' && b.name === 'D1' && b.id === DATABASE)) {
  throw new Error('Production D1 binding mismatch')
}
if (!settings.bindings.some(b => b.type === 'r2_bucket' && b.name === 'R2' && b.bucket_name === WORKER)) {
  throw new Error('Production R2 binding mismatch')
}
const previous = await api(`workers/scripts/${WORKER}/deployments`)
writeFileSync('.cloudflare-ci/previous-deployment.json', JSON.stringify(previous))
console.log(JSON.stringify({ event: 'release_preflight', commit, worker: WORKER, previous: previous.deployments?.[0]?.id }))
await reportStage('preflight-passed')
const run = args => execFileSync('pnpm', args, { stdio: 'inherit', env: process.env })
await reportStage('time-travel-start')
run(['exec', 'wrangler', 'd1', 'time-travel', 'info', WORKER])
await reportStage('time-travel-passed')
await reportStage('migration-start')
run(['run', 'deploy:database'])
await reportStage('migration-passed')
await reportStage('worker-upload-start')
run(['exec', 'opennextjs-cloudflare', 'deploy'])
await reportStage('worker-upload-passed')

await reportStage('smoke-start')
execFileSync(process.execPath, ['scripts/ci-smoke.mjs'], { stdio: 'inherit', env: process.env })
await reportStage('smoke-passed')
