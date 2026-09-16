import { browserLibraryEnvironment } from './ci-browser-libs.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const run = (args, env = {}) => execFileSync('pnpm', args, {
  stdio: 'inherit', env: { ...process.env, ...env },
})

// A failed check must never leave a previous release marker behind.
rmSync('.cloudflare-ci/release.json', { force: true })
mkdirSync('.cloudflare-ci', { recursive: true })
writeFileSync('.cloudflare-ci/wrangler.json', JSON.stringify({
  name: 'payload-wnam-ci', compatibility_date: '2025-08-15',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [{ binding: 'D1', database_name: 'payload-wnam-ci', database_id: '00000000-0000-0000-0000-000000000001', remote: false }],
  r2_buckets: [{ binding: 'R2', bucket_name: 'payload-wnam-ci', remote: false }],
}))
run(['run', 'ci:check'], { PAYLOAD_TEST_MODE: 'isolated', PAYLOAD_SECRET: 'isolated-test-secret' })
execFileSync(process.execPath, ['scripts/ci-site-isolation.mjs'], { stdio: 'inherit', env: process.env })
run(['exec', 'opennextjs-cloudflare', 'build'], { PAYLOAD_BUILD_PHASE: '1' })
execFileSync(process.execPath, ['scripts/ci-p0-source-encoding.mjs'], { stdio: 'inherit', env: process.env })
execFileSync(process.execPath, ['scripts/ci-p0-bundle-report.mjs'], { stdio: 'inherit', env: process.env })
run(['exec', 'playwright', 'install', '--only-shell', 'chromium'])
run(['exec', 'playwright', 'test', '--config=playwright.cloud-ci.config.ts'], browserLibraryEnvironment())
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
writeFileSync('.cloudflare-ci/release.json', JSON.stringify({ commit, builtAt: new Date().toISOString() }))
