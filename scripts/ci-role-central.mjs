import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

if (process.env.WORKERS_CI !== '1') throw new Error('Complete role checks require Cloudflare Builds')
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const cwd = resolve('.cloudflare-ci/roles/central')
const bundle = resolve(cwd,'.cloudflare-ci/bundle')
const entries = readdirSync(bundle).filter(name => /\.m?js$/.test(name))
assert.equal(entries.length,1,'One complete central Worker entry is required')
const assets = resolve(cwd,'.open-next/assets')
const mime = { '.js': 'application/javascript','.css': 'text/css','.svg': 'image/svg+xml','.png': 'image/png','.ico': 'image/x-icon','.woff2': 'font/woff2','.json': 'application/json' }
const mf = new Miniflare({ host: '127.0.0.1',port: 0,https: true,
  name: 'central',routes: ['hub.beginos.org/*'],modules: true,scriptPath: resolve(bundle,entries[0]),
  modulesRules: [{ type: 'CompiledWasm',include: ['**/*.wasm'],fallthrough: true },{ type: 'Text',include: ['**/*.html','**/*.txt'],fallthrough: true }],
  compatibilityDate: '2025-08-15',compatibilityFlags: ['nodejs_compat','global_fetch_strictly_public'],
  bindings: { PAYLOAD_SECRET: 'central-config-isolated-test-only' },
  d1Databases: { CENTRAL_D1: 'complete-central-app' },
  r2Buckets: { CENTRAL_MEDIA: 'central-app-media',MASTER_ASSET_ARCHIVE: 'central-app-archive' },
  serviceBindings: { ASSETS: async request => {
    const file = resolve(assets,'.' + decodeURIComponent(new URL(request.url).pathname))
    if (!file.startsWith(assets + sep)) return new Response('Not found',{ status: 404 })
    try { return new Response(readFileSync(file),{ headers: { 'content-type': mime[extname(file)] ?? 'application/octet-stream' } }) }
    catch { return new Response('Not found',{ status: 404 }) }
  } },
})
let browser
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
  const worker = await mf.getWorker()
  assert.equal((await worker.fetch('https://unknown.example/admin/login')).status,421)
  const anonymous = await worker.fetch('https://hub.beginos.org/api/users',{ method: 'POST',headers: { 'content-type': 'application/json',origin: 'https://hub.beginos.org' },
    body: JSON.stringify({ email: 'anonymous@example.invalid',password: 'must-not-register-automatically' }) })
  assert.equal(anonymous.status,403,'Central anonymous signup must remain closed')
  const listener = await mf.ready
  browser = await chromium.launch({ headless: true,args: ['--no-proxy-server',`--host-resolver-rules=MAP hub.beginos.org:443 127.0.0.1:${listener.port}`] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true,serviceWorkers: 'block',viewport: { width: 1365,height: 900 } })
  const page = await context.newPage()
  const failedAssets = []
  page.on('response',response => { if (response.url().includes('/_next/') && response.status() >= 400) failedAssets.push(new URL(response.url()).pathname) })
  const login = await page.goto('https://hub.beginos.org/admin/login')
  assert.equal(login.status(),200,'Complete central login page must render')
  await page.locator('input[name=email]').fill('admin@example.invalid')
  await page.locator('input[name=password]').fill('native-central-test-only-password')
  await page.locator('button[type=submit]').click()
  await page.waitForURL(url => url.pathname === '/admin',{ timeout: 45000 })
  await page.getByRole('navigation').first().waitFor()
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
  assert.match(ticket.body,/action="https:\/\/cms-site-a.beginos.org\/auth\/site-login"/)
  assert.match(ticket.body,/name="ticket" value="[0-9a-f]{64}"/)
  assert.equal((await invoke('/auth/enter-site',{ method: 'POST',headers: { 'content-type': 'application/x-www-form-urlencoded' },body: 'siteId=b' })).status,403,'Missing site grant must deny entry')
  await page.setViewportSize({ width: 390,height: 844 })
  await page.reload()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true,'Central admin must fit mobile width')
  await page.screenshot({ path: '.cloudflare-ci/central-admin-mobile.png',fullPage: true })
  assert.deepEqual(failedAssets,[],'Role import map and admin chunks must load')
  await db.prepare('DELETE FROM users_sessions WHERE _parent_id = 7').run()
  assert.equal((await invoke('/auth/enter-site',{ method: 'POST',headers: { 'content-type': 'application/x-www-form-urlencoded' },body: 'siteId=a' })).status,401,'Revoked original central session must deny ticket issuance')
  const report = { event: 'central_application_passed',checkedAt: new Date().toISOString(),
    checks: ['complete-worker','canonical-host','closed-signup','browser-password-login','native-admin-assets','master-create-read','no-site-content-api','real-session-ticket','site-grant-denial','desktop-mobile','session-revocation'],
    remoteDeployment: false }
  writeFileSync('.cloudflare-ci/central-application.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally { await browser?.close(); await mf.dispose() }
