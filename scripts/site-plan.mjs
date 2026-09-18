import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function planningArguments(args) {
  const values = {}
  let mode
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (['--dry-run','--prepare'].includes(arg)) { assert.ok(!mode,'Exactly one planning mode required'); mode = arg.slice(2) }
    else if (['--request-id','--group','--fleet'].includes(arg)) {
      assert.ok(!values[arg] && args[index+1] && !args[index+1].startsWith('-'),'Explicit unique planning option required')
      values[arg] = args[++index]
    } else throw new Error('Usage: site:plan --request-id <UUID> --group <reviewed-group> --fleet operations/fleet/<name>.json (--dry-run | --prepare)')
  }
  assert.ok(mode && values['--request-id'] && values['--group'] && values['--fleet'],'Explicit request, group, fleet and planning mode required')
  assert.match(values['--request-id'],/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.match(values['--group'],/^[a-z0-9-]{1,64}$/)
  assert.match(values['--fleet'],/^operations\/fleet\/[a-z0-9-]+\.json$/)
  return { requestId: values['--request-id'],workerGroup: values['--group'],fleetPath: values['--fleet'],mode }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = planningArguments(process.argv.slice(2))
  assert.equal(process.env.WORKERS_CI,'1','Planning runs only inside Cloudflare Builds')
  assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH))
  const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
  assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
  assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
  const env = { ...process.env,SITE_ADMISSION_SELECTION: JSON.stringify(args),
    CLOUDFLARE_ACCOUNT_ID: 'd487cf34c606620b442632a72272014d',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
  for (const key of ['WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','PAYLOAD_TEST_MODE','PAYLOAD_BUILD_PHASE','PAYLOAD_ROLE_BUILD']) delete env[key]
  execFileSync('pnpm',['exec','payload','run','scripts/site-operations/cloud-plan.ts'],{ env,stdio: 'inherit' })
}
