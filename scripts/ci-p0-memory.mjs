import assert from 'node:assert/strict'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { unstable_startWorker } from 'wrangler'

// Wrangler's inspector requires an Origin header when a client sends User-Agent.
// Resolve its pinned WebSocket implementation, which supports handshake headers.
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const WebSocket = require('ws')

// Called only by the resource-verified P0 deploy script, after fresh build/migrations.
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_BRANCH !== 'feat/site-per-d1') {
  throw new Error('Full-app memory profiling requires Cloudflare Builds')
}
const config = JSON.parse(readFileSync('wrangler.p0.json', 'utf8'))
assert.equal(config.account_id, 'd487cf34c606620b442632a72272014d')
assert.equal(config.name, 'payload-wnam-p0')
assert.deepEqual(config.d1_databases.map(db => db.database_id), [
  '31d5906e-f276-4a61-87c1-31a13e7131e6', '20fd152f-7b7c-4bc6-be81-1a36ea720060',
])
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json', 'utf8')).commit, process.env.WORKERS_CI_COMMIT_SHA)
const gate = process.env.P0_GATE_SECRET
const password = process.env.P0_TEST_PASSWORD
const secret = process.env.PAYLOAD_SECRET
assert.ok(gate && password && secret, 'Missing ephemeral P0 profiling credentials')
const worker = await unstable_startWorker({
  config: 'wrangler.p0.json', envFiles: [], sendMetrics: false,
  bindings: {
    P0_GATE_SECRET: { type: 'secret_text', value: gate },
    PAYLOAD_SECRET: { type: 'secret_text', value: secret },
  },
  dev: {
    watch: false, persist: false, logLevel: 'error',
    server: { hostname: '127.0.0.1', port: 0 },
    inspector: { hostname: '127.0.0.1', port: 0 },
    origin: { hostname: 'p0-a.beginos.org', secure: true },
  },
})
let socket
const pending = new Map()
let sequence = 0
const snapshots = []
try {
  await worker.ready
  const inspector = await worker.inspectorUrl
  assert.ok(inspector, 'Workerd inspector is required for heap measurements')
  const targets = await (await fetch(new URL('/json', inspector))).json()
  assert.equal(targets.length, 1, 'Expected exactly one application inspector target')
  socket = new WebSocket(targets[0].webSocketDebuggerUrl, { origin: 'http://localhost' })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('Workerd inspector connection failed')), { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    clearTimeout(entry.timer)
    if (message.error) entry.reject(new Error(`Inspector ${entry.method}: ${message.error.message}`))
    else entry.resolve(message.result)
  })
  const command = method => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve, reject, timer, method })
    socket.send(JSON.stringify({ id, method }))
  })
  const measure = async phase => snapshots.push({ phase, ...await command('Runtime.getHeapUsage') })
  await measure('before-payload-request')
  const loginResponse = await worker.fetch('https://p0-a.beginos.org/api/users/login', {
    method: 'POST', headers: { cookie: `__Host-p0-access=${gate}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'p0-isolation@example.invalid', password }),
  })
  assert.equal(loginResponse.status, 200, 'Profiling login failed')
  const { token } = await loginResponse.json()
  assert.ok(token)
  await measure('after-payload-login')
  for (let batch = 0; batch < 3; batch++) {
    await Promise.all(Array.from({ length: 8 }, async () => {
      const response = await worker.fetch('https://p0-a.beginos.org/api/categories?depth=0&limit=1', {
        headers: { cookie: `__Host-p0-access=${gate}; payload-token=${token}` },
      })
      await response.arrayBuffer()
      assert.equal(response.status, 200, 'Profiling category read failed')
    }))
    await measure(`after-read-batch-${batch + 1}`)
  }
  await command('HeapProfiler.enable')
  await command('HeapProfiler.collectGarbage')
  await measure('after-explicit-gc')
  const report = {
    event: 'p0_cloud_workerd_heap_profile', commit: process.env.WORKERS_CI_COMMIT_SHA,
    at: new Date().toISOString(), snapshots,
    scope: 'Cloud CI workerd with full build and remote synthetic D1. Inspector affects runtime; forced GC is diagnostic, not production headroom acceptance. No heap contents captured.',
  }
  writeFileSync('.cloudflare-ci/p0-heap-profile.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer)
  socket?.close()
  await worker.dispose()
}
