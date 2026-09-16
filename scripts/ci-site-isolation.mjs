import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { realpathSync, readdirSync, writeFileSync } from 'node:fs'

if (!process.env.CI) throw new Error('Runtime bundling/tests must run in Cloudflare Builds')
const require = createRequire(realpathSync(resolve('node_modules/wrangler/package.json')))
const { Miniflare } = require('miniflare')
const outputDir = resolve('.cloudflare-ci/site-isolation')
execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--config', 'tests/runtime/wrangler.jsonc', '--outdir', outputDir], { stdio: 'inherit' })
const entries = readdirSync(outputDir).filter(name => /\.m?js$/.test(name))
assert.equal(entries.length, 1, `Expected one bundled runtime entry, found ${entries.join(', ')}`)
const mf = new Miniflare({
  modules: true,
  scriptPath: resolve(outputDir, entries[0]),
  compatibilityDate: '2025-08-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { SITE_A: 'isolation-a', SITE_B: 'isolation-b' },
  r2Buckets: ['MEDIA'],
  queueProducers: { JOBS: 'isolation-jobs' },
  queueConsumers: { 'isolation-jobs': { maxBatchSize: 10, maxBatchTimeout: 0 } },
})
const start = Date.now()
try {
  const databases = await Promise.all(['SITE_A', 'SITE_B'].map(name => mf.getD1Database(name)))
  await Promise.all(databases.map(async (db, i) => {
    await db.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);\nCREATE TABLE jobs (id INTEGER PRIMARY KEY, value TEXT NOT NULL);')
    await db.prepare('INSERT INTO records VALUES (1, ?)').bind(i ? 'b' : 'a').run()
  }))
  const call = async path => {
    const res = await mf.dispatchFetch(`https://isolation.test${path}`)
    const text = await res.text()
    assert.equal(res.status, 200, text)
    return text
  }
  await call('/guards')
  await Promise.all(Array.from({ length: 40 }, (_, i) => call(`/crud/${i % 2 ? 'b' : 'a'}/${2 + Math.floor(i / 2)}`)))
  assert.deepEqual(await Promise.all(['a', 'b'].map(site => call(`/stream/${site}`))), ['a', 'b'])
  await Promise.all(['a', 'b'].flatMap(site => [call(`/enqueue/${site}/1`), call(`/enqueue/${site}/1`)]))
  const deadline = Date.now() + 15000
  while (true) {
    const rows = await Promise.all(databases.map(db => db.prepare('SELECT id, value FROM jobs').all()))
    if (rows.every(row => row.results.length === 1)) {
      assert.deepEqual(rows.map(row => row.results), [[{ id: 1, value: 'a' }], [{ id: 1, value: 'b' }]])
      break
    }
    assert.ok(Date.now() < deadline, 'Queue did not drain')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const report = {
    event: 'site_d1_workerd_isolation', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    ok: true, databases: 2, concurrentRequests: 40, elapsedMs: Date.now() - start,
    checks: ['CRUD', 'same IDs', 'batch rollback', 'context guards', 'stale routes', 'streams', 'R2 prefixes', 'cache keys', 'queue delivery and deduplication'],
    scope: 'Cloudflare Builds workerd with local D1/R2/Queues; not deployed D1 or full Payload/admin acceptance',
  }
  writeFileSync('.cloudflare-ci/site-isolation.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await mf.dispose()
}
