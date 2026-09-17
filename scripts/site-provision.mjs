import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function provisionArguments(args) {
  let mode,request
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (['--dry-run','--apply'].includes(arg)) { assert.ok(!mode,'Exactly one provision mode required'); mode = arg.slice(2) }
    else if (arg === '--request') { assert.ok(!request && args[index+1] && !args[index+1].startsWith('-'),'One request file required'); request = args[++index] }
    else throw new Error('Usage: site:provision --request <reviewed.json> (--dry-run | --apply)')
  }
  assert.ok(mode && request,'Explicit request and provision mode required')
  return { mode,request }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = provisionArguments(process.argv.slice(2))
  assert.equal(process.env.WORKERS_CI,'1','Provision runs only inside Cloudflare Builds')
  assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH))
  const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
  assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
  assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
  const env = { ...process.env,SITE_PROVISION_REQUEST: resolve(args.request),SITE_PROVISION_MODE: args.mode,
    CLOUDFLARE_ACCOUNT_ID: 'd487cf34c606620b442632a72272014d',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
  for (const key of ['WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','PAYLOAD_TEST_MODE','PAYLOAD_BUILD_PHASE','PAYLOAD_ROLE_BUILD']) delete env[key]
  execFileSync('pnpm',['exec','payload','run','scripts/site-operations/cloud-provision.ts'],{ env,stdio: 'inherit' })
}
