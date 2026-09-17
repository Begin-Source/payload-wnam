import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { checkLifecycleBrowser } from './p1-lifecycle-browser.mjs'

if (process.env.WORKERS_CI !== '1') throw new Error('Complete role checks require Cloudflare Builds')
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const cwd = resolve('.cloudflare-ci/roles/central')
const bundle = resolve(cwd,'.cloudflare-ci/bundle')
const entries = readdirSync(bundle).filter(name => /\.m?js$/.test(name))
assert.equal(entries.length,1,'One complete central Worker entry is required')
const moduleFiles = readdirSync(bundle,{ recursive: true }).filter(name => typeof name === 'string' && /\.(?:m?js|wasm|html|txt)$/.test(name))
const modules = [entries[0],...moduleFiles.filter(name => name !== entries[0])].map(name => ({
  type: name.endsWith('.wasm') ? 'CompiledWasm' : /\.(?:html|txt)$/.test(name) ? 'Text' : 'ESModule',path: resolve(bundle,name),
}))
const assets = resolve(cwd,'.open-next/assets')
const mf = new Miniflare({ host: '127.0.0.1',port: 0,https: true,
  // In pinned Miniflare, explicit routes address the raw user Worker and bypass
  // its assets router. A single-role listener uses the assets-aware fallback.
  name: 'central',modules,modulesRoot: bundle,
  compatibilityDate: '2025-08-15',compatibilityFlags: ['nodejs_compat','global_fetch_strictly_public'],
  bindings: { CENTRAL_ORIGIN: 'https://p1-hub.beginos.org', PAYLOAD_SECRET: 'central-config-isolated-test-only' },
  d1Databases: { CENTRAL_D1: 'complete-central-app' },
  r2Buckets: { CENTRAL_MEDIA: 'central-app-media',MASTER_ASSET_ARCHIVE: 'central-app-archive' },
  // Match Workers Static Assets routing, not only an ASSETS fetch binding.
  assets: { directory: assets,binding: 'ASSETS',routerConfig: { has_user_worker: true } },
})
let browser, page
const assetResponses = [], browserErrors = []
try {
  const db = await mf.getD1Database('CENTRAL_D1')
  const fixture = JSON.parse(readFileSync('.cloudflare-ci/role-central-fixture.json','utf8'))
  for (const sql of fixture.schema) await db.prepare(sql).run()
  const quote = value => '"' + value.replaceAll('"','""') + '"'
  const inserts = []
  for (const table of fixture.tables) for (const row of table.rows) {
    const keys = Object.keys(row)
    inserts.push(db.prepare(`INSERT INTO ${quote(table.name)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map(key => row[key])))
  }
  await db.batch([db.prepare('PRAGMA defer_foreign_keys = ON'),...inserts])
  await db.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind('a','7','editor').run()
  await db.prepare('UPDATE sites SET name = ? WHERE runtime_site_id = ?')
    .bind('户外装备选购指南 / Travel & Outdoor '.repeat(8) + '🌿','a').run()
  const worker = await mf.getWorker()
  const staticFiles = readdirSync(assets,{ recursive: true }).filter(name => typeof name === 'string')
  for (const extension of ['.js','.css']) {
    const file = staticFiles.find(name => name.startsWith('_next/') && name.endsWith(extension))
    assert.ok(file,`Missing built ${extension} asset`)
    const response = await mf.dispatchFetch('https://p1-hub.beginos.org/' + file)
    assert.equal(response.status,200,`Native listener must serve ${extension} assets before browser checks`)
    assert.match(response.headers.get('content-type'),extension === '.js' ? /javascript/ : /text\/css/)
  }
  console.log(JSON.stringify({ event: 'central_asset_router_passed' }))
  assert.equal((await worker.fetch('https://unknown.example/admin/login')).status,421)
  const anonymous = await worker.fetch('https://p1-hub.beginos.org/api/users',{ method: 'POST',headers: { 'content-type': 'application/json',origin: 'https://p1-hub.beginos.org' },
    body: JSON.stringify({ email: 'anonymous@example.invalid',password: 'must-not-register-automatically' }) })
  assert.equal(anonymous.status,403,'Central anonymous signup must remain closed')
  const listener = await mf.ready
  browser = await chromium.launch({ headless: true,args: ['--no-proxy-server','--ignore-certificate-errors','--disable-background-networking',`--host-resolver-rules=MAP p1-hub.beginos.org:443 127.0.0.1:${listener.port}`] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true,serviceWorkers: 'block',viewport: { width: 1365,height: 900 } })
  // This browser is confined to the disposable HTTPS listener with a self-signed
  // certificate; it cannot contact the actual production host or third parties.
  await context.route('**/*',route => new URL(route.request().url()).hostname === 'p1-hub.beginos.org' ? route.continue() : route.abort())
  page = await context.newPage()
  page.on('pageerror',error => browserErrors.push(error.message.slice(0,240)))
  const failedAssets = []
  page.on('response',response => { if (response.url().includes('/_next/')) {
    const path = new URL(response.url()).pathname
    assetResponses.push({ path,status: response.status(),type: response.headers()['content-type'] })
    if (response.status() >= 400) failedAssets.push(path)
  } })
  page.on('requestfailed',request => browserErrors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`))
  const login = await page.goto('https://p1-hub.beginos.org/admin/login')
  assert.equal(login.status(),200,'Complete central login page must render')
  // Payload exposes this readiness signal specifically for browser automation.
  // Filling SSR fields before hydration can be discarded by REPLACE_STATE.
  await page.locator('form[data-form-ready="true"]').waitFor()
  await page.waitForLoadState('networkidle')
  await page.locator('input[name=email]').fill('admin@example.invalid')
  await page.locator('input[name=password]').fill('native-central-test-only-password')
  // Match Payload's upstream login helper: allow field validation (150 ms
  // throttling) to settle before submit. Values themselves never enter logs.
  await page.waitForTimeout(500)
  assert.equal(await page.locator('input[name=email]').evaluate(input => input.value === 'admin@example.invalid'),true,'Email must survive form initialization')
  assert.equal(await page.locator('input[name=password]').evaluate(input => input.value.length > 0),true,'Password must survive form initialization')
  const authentication = page.waitForResponse(response => new URL(response.url()).pathname === '/api/users/login' && response.request().method() === 'POST')
  await page.locator('button[type=submit]').click()
  assert.equal((await authentication).status(),200,'Browser password login must succeed')
  await page.waitForURL(url => url.pathname === '/admin',{ timeout: 45000 })
  await page.getByRole('navigation').first().waitFor()
  console.log(JSON.stringify({ event: 'central_browser_login_passed' }))
  const chooser = page.getByRole('region',{ name: '我的网站' })
  await chooser.locator('[data-site-id="a"]').waitFor()
  assert.equal(await chooser.locator('[data-site-id="b"]').count(),0,'No grant must mean no site row')
  assert.equal(await chooser.getByRole('button',{ name: '下一页',exact: true }).isDisabled(),true)
  await chooser.getByLabel('查找网站',{ exact: true }).fill('no-matching-site')
  await chooser.getByLabel('查找网站',{ exact: true }).press('Enter')
  await chooser.getByText('没有匹配的网站。请修改名称或站点 ID 后重试。',{ exact: true }).waitFor()
  await chooser.getByLabel('查找网站',{ exact: true }).fill('')
  await chooser.getByRole('button',{ name: '查找',exact: true }).click()
  await chooser.locator('[data-site-id="a"]').waitFor()
  await db.prepare("UPDATE site_runtime_registry SET migration_state = 'paused', routing_version = routing_version + 1 WHERE site_id = 'a'").run()
  await chooser.getByRole('button',{ name: '查找',exact: true }).click()
  await chooser.getByText('已暂停',{ exact: true }).waitFor()
  assert.equal(await chooser.locator('[data-site-id="a"]').getByRole('button').isDisabled(),true)
  await db.prepare("UPDATE site_runtime_registry SET migration_state = 'active', routing_version = routing_version + 1 WHERE site_id = 'a'").run()
  await chooser.getByRole('button',{ name: '查找',exact: true }).click()
  await chooser.getByText('可进入',{ exact: true }).waitFor()
  const intercept = '**/auth/sites?*'
  await page.route(intercept,route => route.fulfill({ status: 503,contentType: 'text/plain',body: 'Site list unavailable' }))
  await chooser.getByRole('button',{ name: '查找',exact: true }).click()
  await chooser.getByRole('button',{ name: '重新加载' }).waitFor()
  await page.unroute(intercept)
  await chooser.getByRole('button',{ name: '重新加载' }).click()
  await chooser.locator('[data-site-id="a"]').waitFor()

  await db.prepare("UPDATE site_runtime_access SET role='manager' WHERE site_id='a' AND user_id='7'").run()
  await chooser.getByRole('button',{ name: '查找',exact: true }).click()
  await chooser.locator('[data-site-id="a"]').getByRole('button',{ name: /^暂停网站 / }).waitFor()
  await checkLifecycleBrowser({ hub: page,siteId: 'a',artifactPrefix: '.cloudflare-ci/central-lifecycle' })

  await page.screenshot({ path: '.cloudflare-ci/central-admin-desktop.png',fullPage: true })
  const invoke = (path,init = {}) => page.evaluate(async ({ path,init }) => {
    const response = await fetch(path,init)
    return { status: response.status,cacheControl: response.headers.get('cache-control'),body: await response.text() }
  },{ path,init })
  const me = await invoke('/api/users/me')
  assert.equal(me.status,200)
  assert.equal(JSON.parse(me.body).user.id,7,'Browser login must establish the real central Payload session')
  assert.match(me.cacheControl,/no-store/)
  assert.equal((await invoke('/api/articles')).status,404,'Central application must not expose site articles')
  const created = await invoke('/api/authors',{ method: 'POST',headers: { 'content-type': 'application/json' },body: JSON.stringify({ displayName: 'Complete central app author',tenant: 1 }) })
  assert.equal(created.status,201,'Authorized central master edit must succeed')
  const author = JSON.parse(created.body).doc
  assert.ok(author.id)
  const record = await invoke(`/api/authors/${author.id}`)
  assert.equal(JSON.parse(record.body).displayName,'Complete central app author')
  const ticket = await invoke('/auth/enter-site',{ method: 'POST',headers: { 'content-type': 'application/x-www-form-urlencoded' },body: 'siteId=a' })
  assert.equal(ticket.status,200,'Real JWT-authenticated central login must issue a site ticket')
  assert.ok(/action="https:\/\/cms-site-a.beginos.org\/auth\/site-login"/.test(ticket.body),'Canonical POST handoff action required')
  assert.ok(/name="ticket" value="[0-9a-f]{64}"/.test(ticket.body),'Single-use ticket required')
  assert.equal((await invoke('/auth/enter-site',{ method: 'POST',headers: { 'content-type': 'application/x-www-form-urlencoded' },body: 'siteId=b' })).status,403,'Missing site grant must deny entry')
  await page.setViewportSize({ width: 390,height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true,'Central admin must fit mobile width')
  await page.screenshot({ path: '.cloudflare-ci/central-admin-mobile.png',fullPage: true })
  assert.deepEqual(failedAssets,[],'Role import map and admin chunks must load')
  await db.prepare('DELETE FROM users_sessions WHERE _parent_id = 7').run()
  assert.equal((await invoke('/auth/enter-site',{ method: 'POST',headers: { 'content-type': 'application/x-www-form-urlencoded' },body: 'siteId=a' })).status,401,'Revoked original central session must deny ticket issuance')
  const report = { event: 'central_application_passed',checkedAt: new Date().toISOString(),
    checks: ['complete-worker','canonical-host','closed-signup','browser-password-login','native-admin-assets','master-create-read','no-site-content-api','real-session-ticket','site-grant-denial','desktop-mobile','session-revocation','granted-site-chooser','site-search-empty','paused-site-disabled','directory-retry'],
    remoteDeployment: false }
  writeFileSync('.cloudflare-ci/central-application.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} catch (error) {
  // Fixture-only diagnostics: no headers, cookie values, input values or handoff HTML.
  const dom = page ? await page.evaluate(() => ({ title: document.title,text: document.body.innerText.slice(0,600),
    inputs: [...document.querySelectorAll('input')].map(input => ({ type: input.type,name: input.name,id: input.id,filled: input.value.length > 0 })) })).catch(() => null) : null
  console.log(JSON.stringify({ event: 'central_application_failure',dom,assetResponses: assetResponses.slice(-30),browserErrors: browserErrors.slice(-10) }))
  throw error
} finally { await browser?.close(); await mf.dispose() }
