import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash,randomBytes } from 'node:crypto'
import { existsSync,readFileSync,writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { browserLibraryEnvironment } from './ci-browser-libs.mjs'
import { p1ReleaseRequest } from './p1-release-manifests.mjs'
import { P1_ACCOUNT,P1_EMAIL,P1_ORIGIN,P1_ZONE } from './p1-manifests.mjs'

assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.ok(existsSync('.cloudflare-ci/roles/site/.open-next/worker.js'))
if (process.env.WRANGLER_CI_MATCH_TAG) assert.equal(process.env.WRANGLER_CI_MATCH_TAG,'a53ec5c30f6f4623909113bf36ca914f')
const selected = p1ReleaseRequest(),operation = selected.admission
assert.ok(operation && !selected.reconcile,'Explicit reviewed admission operation required')
const { request: human } = operation,{ central,plan,centralWorkerTag } = selected.request
const env = { ...process.env,CLOUDFLARE_ACCOUNT_ID: P1_ACCOUNT,CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',NODE_ENV: 'production' }
for (const key of ['WRANGLER_CI_OVERRIDE_NAME','WRANGLER_CI_MATCH_TAG','PAYLOAD_TEST_MODE','PAYLOAD_BUILD_PHASE','PAYLOAD_ROLE_BUILD']) delete env[key]
const token = env.CLOUDFLARE_API_TOKEN
assert.ok(token)
const api = async (path,init = {},account = true) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${account ? `accounts/${P1_ACCOUNT}/` : ''}${path}`,{
    ...init,headers: { authorization: `Bearer ${token}`,'content-type': 'application/json' },signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  assert.ok(response.ok && result.success,`Admission preflight failed (${response.status})`)
  return result.result
}
const query = async (sql,params = []) => {
  const result = await api(`d1/database/${plan.centralDatabaseId}/query`,{ method: 'POST',body: JSON.stringify({ sql,params }) })
  assert.ok(result.every(value => value.success)); return result[0].results
}
const deployment = async name => (await api(`workers/scripts/${name}/deployments`)).deployments[0]
const unchangedWorkers = ['payload-wnam','payload-wnam-p0',central.name]
const beforeDeployments = Object.fromEntries(await Promise.all(unchangedWorkers.map(async name => [name,(await deployment(name)).id])))
assert.equal(beforeDeployments[central.name],operation.centralDeploymentId,'Pinned central deployment changed')
const zone = await api(`zones/${P1_ZONE}`,{},false)
assert.equal(zone.name,'beginos.org'); assert.equal(zone.account.id,P1_ACCOUNT)
const workers = await api('workers/scripts')
assert.equal(workers.find(worker => worker.id === central.name)?.tag,centralWorkerTag)
assert.equal(workers.find(worker => worker.id === plan.workerName)?.tag,plan.workerTag)
const settings = await api(`workers/scripts/${central.name}/settings`)
assert.ok(settings.bindings.some(binding => binding.name === 'CENTRAL_D1' && binding.id === plan.centralDatabaseId && binding.type === 'd1'))
assert.equal(settings.bindings.find(binding => binding.name === 'CENTRAL_ORIGIN')?.text,P1_ORIGIN)
const database = await api(`d1/database/${plan.centralDatabaseId}`)
assert.equal(database.name,central.d1_databases[0].database_name); assert.equal(database.read_replication?.mode,'disabled')
const domains = await api('workers/domains')
assert.equal(domains.find(domain => domain.hostname === new URL(P1_ORIGIN).hostname)?.service,central.name)
assert.equal(domains.find(domain => domain.hostname === 'hub.beginos.org')?.service,'payload-wnam')
const schema = JSON.parse(readFileSync('.cloudflare-ci/role-central-schema.json','utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const schemaDigest = hash([...schema.objects].sort((a,b) => a.name.localeCompare(b.name)))
assert.deepEqual(await query('SELECT role,digest,operation_id,completed FROM p1_schema_bootstrap WHERE id=1'),
  [{ role: 'central',digest: schemaDigest,operation_id: 'p1-central-schema-v6',completed: 1 }])
const objects = await query("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name!='p1_schema_bootstrap'")
assert.equal(hash(objects.sort((a,b) => a.name.localeCompare(b.name))),schemaDigest,'Live central schema differs from checked runtime')
assert.deepEqual(await query('SELECT release_id FROM site_group_releases WHERE completed_at IS NULL'),[],'Finish pending ordinary releases first')
assert.deepEqual(await query('SELECT operation_id FROM site_provision_operations WHERE completed_at IS NULL AND operation_id!=?',[human.requestId]),[])
const existing = await query('SELECT input_json,state FROM site_provision_requests WHERE request_id=?',[human.requestId])
if (existing.length) { assert.equal(existing.length,1); assert.deepEqual(JSON.parse(existing[0].input_json),human); assert.notEqual(existing[0].state,'cancelled') }
else assert.deepEqual(await query('SELECT site_id FROM site_runtime_registry WHERE site_id=?',[human.siteId]),[],'Do not adopt an existing site')
const originalQueries = [
  ['registry','SELECT * FROM site_runtime_registry WHERE site_id!=? ORDER BY site_id',human.siteId],
  ['access','SELECT * FROM site_runtime_access WHERE site_id!=? ORDER BY site_id,user_id',human.siteId],
  ['provisions','SELECT * FROM site_provision_operations WHERE operation_id!=? ORDER BY operation_id',human.requestId],
  ['receipts','SELECT * FROM site_provision_steps WHERE operation_id!=? ORDER BY operation_id,step',human.requestId],
]
const snapshot = async () => Object.fromEntries(await Promise.all(originalQueries.map(async ([name,sql,id]) => [name,await query(sql,[id])])))
const before = await snapshot()
for (const id of ['p1-a','p1-b','p1-c','p1-d']) {
  assert.ok(before.registry.some(row => row.site_id === id && row.migration_state === 'active' && row.production_enabled === 0))
  assert.ok(before.access.some(row => row.site_id === id && row.user_id === '7' && row.role === 'manager'),'Preserve current test grants')
}
console.log(JSON.stringify({ event: 'p1_admission_preflight_passed',commit,requestId: human.requestId,siteId: human.siteId,
  centralDeploymentId: operation.centralDeploymentId,centralRuntimeCommit: operation.centralCommit,sourceDigest: operation.sourceDigest,originalStateDigest: hash(before) }))

// Only the dedicated synthetic account is prepared. Bootstrap validates its
// ownership and the existing schemas; its random signing secret is Local API
// configuration only. The pinned deployed central secret is never rotated.
const password = randomBytes(32).toString('hex')
execFileSync('pnpm',['exec','payload','run','scripts/p1-bootstrap.ts'],{ env: { ...env,PAYLOAD_P1_BOOTSTRAP: '1',
  P1_TEST_PASSWORD: password,P1_CENTRAL_SECRET: randomBytes(32).toString('hex') },stdio: 'inherit' })
Object.assign(env,browserLibraryEnvironment())
const requestInBrowser = async submit => {
  const browser = await chromium.launch({ headless: true,args: ['--disable-background-networking'],env })
  const context = await browser.newContext({ serviceWorkers: 'block',viewport: { width: 1365,height: 900 } })
  context.setDefaultTimeout(30000); context.setDefaultNavigationTimeout(60000)
  await context.route('**/*',route => new URL(route.request().url()).origin === P1_ORIGIN ? route.continue() : route.abort())
  const page = await context.newPage()
  let authenticated = false
  try {
    assert.equal((await page.goto(`${P1_ORIGIN}/admin/login`))?.status(),200)
    await page.locator('form[data-form-ready="true"]').waitFor(); await page.waitForLoadState('networkidle')
    await page.locator('input[name=email]').fill(P1_EMAIL); await page.locator('input[name=password]').fill(password)
    const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/users/login' && response.request().method() === 'POST')
    await page.locator('button[type=submit]').click(); assert.equal((await login).status(),200); authenticated = true
    await page.waitForURL(url => url.pathname === '/admin')
    const result = await page.evaluate(async ({ human,submit }) => {
      const r = await fetch(submit ? '/auth/site-request' : `/auth/site-request?requestId=${human.requestId}`,{
        signal: AbortSignal.timeout(20000),...(submit ? { method: 'POST',headers: { 'content-type': 'application/json' },body: JSON.stringify(human) } : {}),
      })
      return { status: r.status,cache: r.headers.get('cache-control'),body: await r.json() }
    },{ human,submit })
    assert.equal(result.status,200); assert.equal(result.cache,'private, no-store')
    assert.deepEqual(result.body.input,human); assert.equal(result.body.requestId,human.requestId)
    assert.ok(submit ? ['queued','provisioning','completed'].includes(result.body.state) : result.body.state === 'completed')
    await page.reload(); await page.getByRole('region',{ name: '建站申请',exact: true }).getByLabel('所属租户',{ exact: true }).selectOption(String(human.tenantId))
    const row = page.locator(`[data-request-id="${human.requestId}"]`)
    await row.waitFor()
    if (!submit) await row.getByText('已建成',{ exact: true }).waitFor()
    await row.screenshot({ path: `.cloudflare-ci/admission-${submit ? 'submitted' : 'completed'}.png` })
    console.log(JSON.stringify({ event: submit ? 'p1_admission_http_submitted' : 'p1_admission_ui_completed',requestId: human.requestId,
      siteId: human.siteId,state: result.body.state,replayed: result.body.replayed ?? null,remoteDeployment: true }))
  } finally {
    try { if (authenticated) assert.equal(await page.evaluate(async () => (await fetch('/api/users/logout',{ method: 'POST' })).status),200) }
    finally { await context.close(); await browser.close() }
  }
}
await requestInBrowser(true)
const args = ['--request-id',human.requestId,'--group',operation.workerGroup,'--fleet',operation.fleetPath]
const run = mode => execFileSync('pnpm',['run','site:provision',...args,`--${mode}`],{
  env: { ...env,SITE_PROVISION_EMAIL: P1_EMAIL,SITE_PROVISION_PASSWORD: password },stdio: 'inherit',
})
run('dry-run'); run('apply')
const originalReceipt = await query('SELECT * FROM site_provision_steps WHERE operation_id=? ORDER BY step',[human.requestId])
run('apply')
assert.deepEqual(await query('SELECT * FROM site_provision_steps WHERE operation_id=? ORDER BY step',[human.requestId]),originalReceipt)
execFileSync('pnpm',['exec','payload','run','scripts/ci-p1-admission-verify.ts'],{ env,stdio: 'inherit' })
await requestInBrowser(false)
assert.deepEqual(await snapshot(),before,'Admission altered an existing member or historical operation')
for (const name of unchangedWorkers) assert.equal((await deployment(name)).id,beforeDeployments[name],'Unrelated Worker changed')
const report = { event: 'p1_admission_operation_passed',checkedAt: new Date().toISOString(),commit,requestId: human.requestId,siteId: human.siteId,
  originalStateDigest: hash(before),repeatReceiptsUnchanged: true,retainedDeployments: beforeDeployments,
  limits: ['Explicit synthetic P1 operation; automatic dispatch is not enabled','Five-site full content inventory and ordinary release run separately'] }
writeFileSync('.cloudflare-ci/p1-admission-operation.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
