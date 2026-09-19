import { browserLibraryEnvironment } from './ci-browser-libs.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const runAsync = (command, args, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: 'inherit', env: { ...process.env, ...env },
  })
  child.once('error', reject)
  child.once('close', (code, signal) => {
    if (code === 0) resolve()
    else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`))
  })
})
const runPnpmAsync = (args, env = {}) => runAsync('pnpm', args, env)
const runNodeAsync = (args, env = {}) => runAsync(process.execPath, args, env)
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const reportStage = async stage => {
  try {
    await fetch(`https://agenthub.beginos.org/__ci-stage/${commit}/${stage}`, {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126 Safari/537.36', 'x-agenthub-ci-stage': '1' },
      redirect: 'manual', signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Diagnostics must never replace or weaken a release gate.
  }
}

// A failed check must never leave a previous release marker behind.
rmSync('.cloudflare-ci/release.json', { force: true })
mkdirSync('.cloudflare-ci', { recursive: true })
writeFileSync('.cloudflare-ci/wrangler.json', JSON.stringify({
  name: 'payload-wnam-ci', compatibility_date: '2025-08-15',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [{ binding: 'D1', database_name: 'payload-wnam-ci', database_id: '00000000-0000-0000-0000-000000000001', remote: false }],
  r2_buckets: [{ binding: 'R2', bucket_name: 'payload-wnam-ci', remote: false }],
}))
// Workers Builds has a hard 20-minute timeout. These groups use independent
// output directories and retain every gate while avoiding idle serial time.
await reportStage('checks-start')
await Promise.all([
  runPnpmAsync(['run', 'ci:check'], { PAYLOAD_TEST_MODE: 'isolated', PAYLOAD_SECRET: 'isolated-test-secret' }),
  runPnpmAsync(['exec', 'playwright', 'install', '--only-shell', 'chromium']),
])
await reportStage('checks-passed')
const browserEnv = browserLibraryEnvironment()
await reportStage('role-builds-start')
await Promise.all([
  runNodeAsync(['scripts/ci-role-build.mjs','central']),
  runNodeAsync(['scripts/ci-role-build.mjs','site']),
])
await reportStage('role-builds-passed')
await reportStage('central-runtime-start')
// These checks each boot a native workerd/Miniflare runtime over the same
// installed Next server modules. Running them together intermittently corrupts
// module initialization (`next/server` is then observed as a non-constructor),
// while serial execution adds only a few seconds.
await runNodeAsync(['scripts/ci-role-central.mjs'], browserEnv)
await runNodeAsync(['scripts/ci-site-isolation.mjs'])
await reportStage('central-runtime-passed')
await reportStage('site-runtime-start')
execFileSync(process.execPath, ['scripts/ci-role-site.mjs'], { stdio: 'inherit', env: { ...process.env, ...browserEnv } })
await reportStage('site-runtime-passed')
await reportStage('root-build-start')
await runPnpmAsync(['exec', 'opennextjs-cloudflare', 'build'], { PAYLOAD_BUILD_PHASE: '1' })
await reportStage('root-build-passed')
execFileSync(process.execPath, ['scripts/ci-p0-source-encoding.mjs'], { stdio: 'inherit', env: process.env })
execFileSync(process.execPath, ['scripts/ci-p0-bundle-report.mjs'], { stdio: 'inherit', env: process.env })
await reportStage('bundle-passed')
await reportStage('playwright-start')
await runPnpmAsync(['exec', 'playwright', 'test', '--config=playwright.cloud-ci.config.ts'], browserEnv)
await reportStage('playwright-passed')
await reportStage('identity-start')
execFileSync(process.execPath, ['--import=tsx', 'scripts/ci-site-identity.mjs'], { stdio: 'inherit', env: { ...process.env, ...browserEnv } })
await reportStage('identity-passed')
writeFileSync('.cloudflare-ci/release.json', JSON.stringify({ commit, builtAt: new Date().toISOString() }))
