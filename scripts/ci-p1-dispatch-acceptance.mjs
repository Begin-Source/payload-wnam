import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { browserLibraryEnvironment } from './ci-browser-libs.mjs'
import { P1_EMAIL,P1_ORIGIN } from './p1-manifests.mjs'
import { workersCiCommit } from './workers-ci-identity.mjs'

const acceptancePath = 'operations/p1-dispatch-acceptance.json'
const expectedRequest = {
  requestId: '79d647a4-a4fb-4e8b-8403-8372c67e0452',siteId: 'p1-f',name: 'P1 Automatic F',
  tenantId: 1,ownerUserId: 7,timezone: 'Europe/Berlin',
}

export function p1DispatchAcceptance() {
  const value = JSON.parse(readFileSync(acceptancePath,'utf8'))
  assert.deepEqual(Object.keys(value).sort(),['enabled','request'])
  assert.equal(typeof value.enabled,'boolean')
  assert.deepEqual(value.request,expectedRequest)
  return value
}

async function submit() {
  assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
  const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
  assert.equal(workersCiCommit(),commit)
  assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
  const selection = JSON.parse(readFileSync('.cloudflare-ci/p1-dispatch-selection.json','utf8'))
  assert.equal(selection.buildUuid,process.env.WORKERS_CI_BUILD_UUID)
  if (selection.selected) {
    console.log(JSON.stringify({ event: 'p1_dispatch_acceptance_skipped',reason: 'dispatch-build',buildUuid: selection.buildUuid }))
    return
  }
  const { enabled,request } = p1DispatchAcceptance()
  if (!enabled) {
    console.log(JSON.stringify({ event: 'p1_dispatch_acceptance_skipped',reason: 'disabled',buildUuid: selection.buildUuid }))
    return
  }
  const password = process.env.P1_TEST_PASSWORD
  assert.ok(password && password.length >= 32,'Synthetic P1 acceptance credential unavailable')
  const browserEnv = { ...process.env,...browserLibraryEnvironment() }
  const browser = await chromium.launch({ headless: true,args: ['--disable-background-networking'],env: browserEnv })
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
    const response = await page.evaluate(async input => {
      const result = await fetch('/auth/site-request',{ method: 'POST',headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),signal: AbortSignal.timeout(20000) })
      return { status: result.status,cache: result.headers.get('cache-control'),body: await result.json() }
    },request)
    assert.equal(response.status,200); assert.equal(response.cache,'private, no-store')
    assert.deepEqual(response.body.input,request); assert.equal(response.body.requestId,request.requestId)
    assert.ok(['queued','dispatching','provisioning','review','completed'].includes(response.body.state),'Unexpected acceptance request state')
    await page.reload(); await page.getByRole('region',{ name: '建站申请',exact: true }).getByLabel('所属租户',{ exact: true }).selectOption(String(request.tenantId))
    await page.locator(`[data-request-id="${request.requestId}"]`).waitFor()
    const report = { event: 'p1_dispatch_acceptance_submitted',checkedAt: new Date().toISOString(),commit,
      buildUuid: selection.buildUuid,requestId: request.requestId,siteId: request.siteId,state: response.body.state,
      replayed: response.body.replayed }
    writeFileSync('.cloudflare-ci/p1-dispatch-acceptance-submission.json',JSON.stringify(report,null,2))
    console.log(JSON.stringify(report))
  } finally {
    try { if (authenticated) assert.equal(await page.evaluate(async () => (await fetch('/api/users/logout',{ method: 'POST' })).status),200) }
    finally { await context.close(); await browser.close() }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await submit()
