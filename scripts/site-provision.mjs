import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planningArguments } from './site-plan.mjs'

export function provisionArguments(args) {
  let mode,request
  const selection = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (['--dry-run','--apply'].includes(arg)) { assert.ok(!mode,'Exactly one provision mode required'); mode = arg.slice(2) }
    else if (arg === '--request') { assert.ok(!request && args[index+1] && !args[index+1].startsWith('-'),'One request file required'); request = args[++index] }
    else if (['--request-id','--group','--fleet'].includes(arg)) {
      assert.ok(args[index+1] && !args[index+1].startsWith('-'),'Explicit admission selection value required')
      selection.push(arg,args[++index])
    } else throw new Error('Usage: site:provision (--request <reviewed.json> | --request-id <UUID> --group <reviewed-group> --fleet operations/fleet/<name>.json) (--dry-run | --apply)')
  }
  assert.ok(mode && Boolean(request) !== Boolean(selection.length),'Select exactly one request source and explicit provision mode')
  if (selection.length) {
    const { mode: _planningMode,...admission } = planningArguments([...selection,mode === 'apply' ? '--prepare' : '--dry-run'])
    return { admission,mode }
  }
  return { mode,request }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = provisionArguments(process.argv.slice(2))
  assert.equal(process.env.WORKERS_CI,'1','Provision runs only inside Cloudflare Builds')
  assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH))
  const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
  assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
  assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
  const env = { ...process.env,
    CLOUDFLARE_ACCOUNT_ID: 'd487cf34c606620b442632a72272014d',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
  for (const key of ['WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','PAYLOAD_TEST_MODE','PAYLOAD_BUILD_PHASE','PAYLOAD_ROLE_BUILD',
    'SITE_PROVISION_REQUEST','SITE_PROVISION_MODE','SITE_PROVISION_ADMISSION_ID','SITE_ADMISSION_SELECTION']) delete env[key]
  if (args.admission) {
    const mode = args.mode === 'apply' ? 'prepare' : 'dry-run'
    // The cloud planner persists the complete immutable request for apply.
    // Its output is only a transport: the executor re-reads central D1 before
    // every stage and matches that exact admission, never trusting the file.
    execFileSync('pnpm',['exec','payload','run','scripts/site-operations/cloud-plan.ts'],{
      env: { ...env,SITE_ADMISSION_SELECTION: JSON.stringify({ ...args.admission,mode }) },stdio: 'inherit',
    })
    env.SITE_PROVISION_ADMISSION_ID = args.admission.requestId
    env.SITE_PROVISION_REQUEST = resolve('.cloudflare-ci/admission',args.admission.requestId,mode === 'prepare' ? 'request.json' : 'preview-request.json')
  } else env.SITE_PROVISION_REQUEST = resolve(args.request)
  env.SITE_PROVISION_MODE = args.mode
  execFileSync('pnpm',['exec','payload','run','scripts/site-operations/cloud-provision.ts'],{ env,stdio: 'inherit' })
}
