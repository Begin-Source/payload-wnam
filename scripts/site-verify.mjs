import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workersCiCommit } from './workers-ci-identity.mjs'

export function verificationArguments(args) {
  assert.ok(args.length === 2 && args[0] === '--request' && args[1] && !args[1].startsWith('-'),'Usage: site:verify --request <reviewed.json> (read-only)')
  return { request: args[1] }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = verificationArguments(process.argv.slice(2))
  assert.equal(process.env.WORKERS_CI,'1','Verification runs only inside Cloudflare Builds')
  assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH))
  const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
  assert.equal(workersCiCommit(),commit)
  assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
  const env = { ...process.env,SITE_VERIFY_REQUEST: resolve(args.request),CLOUDFLARE_ACCOUNT_ID: 'd487cf34c606620b442632a72272014d',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
  for (const key of ['WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','PAYLOAD_TEST_MODE','PAYLOAD_BUILD_PHASE','PAYLOAD_ROLE_BUILD']) delete env[key]
  execFileSync('pnpm',['exec','payload','run','scripts/site-operations/cloud-verify.ts'],{ env,stdio: 'inherit' })
}
