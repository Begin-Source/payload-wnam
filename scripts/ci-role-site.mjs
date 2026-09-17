import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (process.env.WORKERS_CI !== '1') throw new Error('Complete role checks require Cloudflare Builds')
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
// Pinned Miniflare aliases all assets roots to one globally named disk service.
// Load a fixture-only copy with the disk service scoped to workerName, matching
// its already-scoped asset/router/RPC services. Do not overwrite the installed
// dependency or change the role build/deployment artifacts.
assert.equal(require('miniflare/package.json').version,'4.20260430.0')
const miniflareEntry = require.resolve('miniflare')
const miniflareSource = readFileSync(miniflareEntry,'utf8')
const unscopedDisk = 'const storageServiceName = `${ASSETS_PLUGIN_NAME}:storage`;'
assert.equal(miniflareSource.split(unscopedDisk).length,2,'Pinned assets service layout changed; review fixture adaptation')
const fixtureEntry = resolve(dirname(miniflareEntry),'site-role-ci.cjs')
writeFileSync(fixtureEntry,miniflareSource.replace(unscopedDisk,'const storageServiceName = `${ASSETS_PLUGIN_NAME}:storage:${options.assets.workerName}`;'))
const { Miniflare, Log, LogLevel } = require(fixtureEntry)
const shared = { compatibilityDate: '2025-08-15', compatibilityFlags: ['nodejs_compat','global_fetch_strictly_public'] }
function application(role) {
  const cwd = resolve('.cloudflare-ci/roles',role), bundle = resolve(cwd,'.cloudflare-ci/bundle')
  const entries = readdirSync(bundle).filter(name => /\.m?js$/.test(name))
  assert.equal(entries.length,1,`One complete ${role} Worker entry required`)
  const files = readdirSync(bundle,{ recursive: true }).filter(name => typeof name === 'string' && /\.(?:m?js|wasm|html|txt)$/.test(name))
  return { name: role, ...shared, modulesRoot: bundle,
    modules: [entries[0],...files.filter(name => name !== entries[0])].map(name => ({
      type: name.endsWith('.wasm') ? 'CompiledWasm' : /\.(?:html|txt)$/.test(name) ? 'Text' : 'ESModule', path: resolve(bundle,name),
    })), assets: { directory: resolve(cwd,'.open-next/assets'), binding: 'ASSETS', routerConfig: { has_user_worker: true } } }
}
const siteConfig = JSON.parse(readFileSync('.cloudflare-ci/roles/site/wrangler.jsonc','utf8'))
// Default Service Bindings pass through Miniflare's native assets router;
// named bindings retain the central RPC entrypoints. Host routes on the raw
// application Worker would bypass Static Assets in the pinned runtime.
const mf = new Miniflare({ host: '127.0.0.1', port: 0, https: true, log: new Log(LogLevel.WARN), workers: [
  { name: 'front', ...shared, modules: true,
    script: `export default { fetch(request,env) { const host=new URL(request.url).hostname;
      if(host==='hub.beginos.org')return env.CENTRAL.fetch(request);
      if(host==='cms-site-a.beginos.org'||host==='cms-site-b.beginos.org')return env.SITE.fetch(request);
      return new Response('Unknown host',{status:421}); } }`,
    serviceBindings: { CENTRAL: 'central', SITE: 'site' } },
  { ...application('central'), bindings: { PAYLOAD_SECRET: 'central-config-isolated-test-only' },
    d1Databases: { CENTRAL_D1: 'complete-sso-central' }, r2Buckets: { CENTRAL_MEDIA: 'sso-central-media', MASTER_ASSET_ARCHIVE: 'sso-master-archive' } },
  { ...application('site'), bindings: { ...siteConfig.vars, PAYLOAD_SECRET: 'site-config-isolated-test-only-secret' },
    d1Databases: { SITE_D1_A: 'complete-sso-a', SITE_D1_B: 'complete-sso-b' }, r2Buckets: { SITE_PUBLIC: 'sso-public', SITE_PRIVATE: 'sso-private' },
    serviceBindings: { IDENTITY: { name: 'central', entrypoint: 'SiteIdentityService' },
      DATA: { name: 'central', entrypoint: 'SiteDataService' }, ROUTING: { name: 'central', entrypoint: 'SiteRoutingService' } } },
] })
async function hydrate(db,role) {
  const fixture = JSON.parse(readFileSync(`.cloudflare-ci/role-${role}-fixture.json`,'utf8'))
  for (const sql of fixture.schema) await db.prepare(sql).run()
  const quote = value => '"' + value.replaceAll('"','""') + '"', inserts = []
  for (const table of fixture.tables) for (const row of table.rows) {
    const keys = Object.keys(row)
    inserts.push(db.prepare(`INSERT INTO ${quote(table.name)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map(key => row[key])))
  }
  await db.batch([db.prepare('PRAGMA defer_foreign_keys = ON'),...inserts])
}
let browser, currentPage
const browserErrors = [], failedAssets = []
try {
  const centralDB = await mf.getD1Database('CENTRAL_D1','central')
  await hydrate(centralDB,'central')
  for (const id of ['a','b']) {
    await hydrate(await mf.getD1Database(`SITE_D1_${id.toUpperCase()}`,'site'),`site-${id}`)
    const manifest = JSON.parse(siteConfig.vars.SITE_ROUTES).find(route => route.siteId === id)
    await centralDB.prepare('UPDATE site_runtime_registry SET database_id = ? WHERE site_id = ?').bind(manifest.databaseId,id).run()
    await centralDB.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind(id,'7','editor').run()
  }
  const listener = await mf.ready
  const hosts = ['hub.beginos.org','cms-site-a.beginos.org','cms-site-b.beginos.org']
  for (const [role,host] of [['central',hosts[0]],['site',hosts[1]],['site',hosts[2]]]) {
    const files = readdirSync(resolve('.cloudflare-ci/roles',role,'.open-next/assets'),{ recursive: true })
    for (const extension of ['.js','.css']) {
      const file = files.find(name => name.startsWith('_next/') && name.endsWith(extension))
      assert.ok(file)
      const response = await mf.dispatchFetch(`https://${host}/${file}`)
      assert.equal(response.status,200,`${role} native assets route: ${response.status === 200 ? '' : (await response.text()).slice(0,1200)}`)
    }
  }
  console.log(JSON.stringify({ event: 'site_application_assets_passed' }))
  browser = await chromium.launch({ headless: true,args: ['--no-proxy-server','--ignore-certificate-errors','--disable-background-networking',
    `--host-resolver-rules=${hosts.map(host => `MAP ${host}:443 127.0.0.1:${listener.port}`).join(', ')}`] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true,serviceWorkers: 'block',viewport: { width: 1365,height: 900 } })
  await context.route('**/*',route => hosts.includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  context.on('page',page => {
    page.on('pageerror',error => browserErrors.push(error.message.slice(0,240)))
    page.on('response',response => { if (response.url().includes('/_next/') && response.status() >= 400) failedAssets.push(new URL(response.url()).pathname) })
  })
  const hub = currentPage = await context.newPage()
  assert.equal((await hub.goto('https://hub.beginos.org/admin/login')).status(),200)
  await hub.locator('form[data-form-ready="true"]').waitFor()
  await hub.waitForLoadState('networkidle')
  await hub.locator('input[name=email]').fill('admin@example.invalid')
  await hub.locator('input[name=password]').fill('native-central-test-only-password')
  await hub.waitForTimeout(500)
  const authenticated = hub.waitForResponse(response => new URL(response.url()).pathname === '/api/users/login' && response.request().method() === 'POST')
  await hub.locator('button[type=submit]').click()
  assert.equal((await authenticated).status(),200)
  await hub.waitForURL(url => url.pathname === '/admin',{ timeout: 45000 })
  console.log(JSON.stringify({ event: 'site_application_central_login_passed' }))
  const pages = {}
  for (const id of ['a','b']) {
    const page = currentPage = await context.newPage()
    await page.goto('https://hub.beginos.org/admin')
    // Navigate through the actual central chooser, with its current grant list.
    const chooser = page.getByRole('region',{ name: '我的网站' })
    await chooser.locator(`[data-site-id="${id}"]`).waitFor()
    await chooser.locator(`[data-site-id="${id}"]`).getByRole('button',{ name: `进入网站 Site ${id}`,exact: true }).click()
    await page.waitForURL(url => url.hostname === `cms-site-${id}.beginos.org` && url.pathname === '/admin',{ timeout: 60000 })
    await page.getByRole('navigation').first().waitFor({ timeout: 45000 })
    await page.waitForLoadState('networkidle')
    pages[id] = page
    console.log(JSON.stringify({ event: 'site_application_sso_passed',siteId: id }))
  }
  const invoke = (page,path,init = {}) => page.evaluate(async ({ path,init }) => {
    const response = await fetch(path,init)
    return { status: response.status,cacheControl: response.headers.get('cache-control'),body: await response.text() }
  },{ path,init })
  const docs = {}
  for (const id of ['a','b']) {
    const page = currentPage = pages[id]
    const me = await invoke(page,'/api/users/me')
    assert.equal(me.status,200)
    assert.equal(JSON.parse(me.body).user.siteId,id)
    assert.equal(JSON.parse(me.body).user.centralUserId,'7')
    const created = await invoke(page,'/api/categories',{ method: 'POST',headers: { 'content-type': 'application/json','x-site-id': id === 'a' ? 'b' : 'a' },
      body: JSON.stringify({ name: `Complete site ${id}`,slug: 'same-category',locale: 'en',site: id === 'a' ? 37 : 82 }) })
    assert.equal(created.status,201,`Site ${id} category create: ${created.body.slice(0,300)}`)
    docs[id] = JSON.parse(created.body).doc
    assert.match(created.cacheControl,/no-store/)
    assert.equal((await invoke(page,'/api/users/login',{ method: 'POST',headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.invalid', password: 'native-central-test-only-password' }) })).status,403,
    'Payload disableLocalStrategy must reject even valid central credentials')
    await page.goto(`https://cms-site-${id}.beginos.org/admin/collections/categories/${docs[id].id}`)
    await page.locator('form[data-form-ready="true"]').waitFor()
    assert.equal(await page.locator('input[name=name]').inputValue(),`Complete site ${id}`,'Complete native editor must read the correct D1')
    await page.screenshot({ path: `.cloudflare-ci/site-${id}-admin-desktop.png`,fullPage: true })
  }
  assert.equal(docs.a.id,docs.b.id,'The two real D1s must contain the same numeric content ID')
  const results = await Promise.all(Array.from({ length: 12 },(_,index) => {
    const id = index % 2 ? 'b' : 'a'
    return invoke(pages[id],`/api/categories/${docs[id].id}?depth=0`).then(result => ({ id,result }))
  }))
  for (const { id,result } of results) { assert.equal(result.status,200); assert.equal(JSON.parse(result.body).name,`Complete site ${id}`) }
  const changed = await invoke(pages.a,`/api/categories/${docs.a.id}`,{ method: 'PATCH',headers: { 'content-type': 'application/json' },body: JSON.stringify({ name: 'Updated only A' }) })
  assert.equal(changed.status,200)
  assert.equal(JSON.parse((await invoke(pages.b,`/api/categories/${docs.b.id}`)).body).name,'Complete site b')
  const cookies = (await context.cookies()).filter(cookie => cookie.name === '__Host-site-session')
  assert.equal(cookies.length,2)
  assert.deepEqual(cookies.map(cookie => cookie.domain).sort(),hosts.slice(1).sort())
  assert.ok(cookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict' && cookie.path === '/'))
  currentPage = pages.a
  await pages.a.setViewportSize({ width: 390,height: 844 })
  assert.equal(await pages.a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true)
  await pages.a.screenshot({ path: '.cloudflare-ci/site-a-admin-mobile.png',fullPage: true })
  assert.deepEqual(failedAssets,[])
  assert.deepEqual(browserErrors,[],'Complete site admin must have no uncaught browser errors')
  await centralDB.prepare('DELETE FROM site_runtime_access WHERE site_id = ? AND user_id = ?').bind('a','7').run()
  assert.equal((await invoke(pages.a,`/api/categories/${docs.a.id}`)).status,403,'Grant revocation must apply immediately')
  assert.equal((await invoke(pages.a,`/api/categories/${docs.a.id}`,{ method: 'PATCH',headers: { 'content-type': 'application/json' },body: JSON.stringify({ name: 'Denied' }) })).status,403)
  assert.equal((await invoke(pages.b,`/api/categories/${docs.b.id}`)).status,200,'Other site grant stays usable')
  // Native logout page uses AuthProvider's POST /api/users/logout. It must
  // revoke the central site session, not just clear React's user state.
  const logoutResponse = pages.b.waitForResponse(response => new URL(response.url()).pathname === '/api/users/logout' && response.request().method() === 'POST')
  await pages.b.goto('https://cms-site-b.beginos.org/admin/logout')
  assert.equal((await logoutResponse).status(),200)
  assert.equal((await context.cookies('https://cms-site-b.beginos.org')).some(cookie => cookie.name === '__Host-site-session'),false)
  assert.equal((await invoke(pages.a,'/api/users/logout',{ method: 'POST' })).status,200,'Revoked grant must still permit logout')
  assert.equal((await context.cookies()).some(cookie => cookie.name === '__Host-site-session'),false)
  const siteWorker = await mf.getWorker('site')
  const expired = await siteWorker.fetch('https://cms-site-b.beginos.org/api/categories',{ headers: { cookie: `__Host-site-session=${cookies.find(cookie => cookie.domain === hosts[2]).value}` } })
  assert.equal(expired.status,403,'Copied old browser credential must be centrally revoked')
  const report = { event: 'site_application_passed',checkedAt: new Date().toISOString(),remoteDeployment: false,
    checks: ['complete-central-site-workers','native-assets','browser-central-password-login','central-chooser-click','real-ticket-post-handoff','two-host-only-cookies',
      'native-site-admin-editors','same-id-concurrent-reads','site-isolated-create-update','no-site-password-login','desktop-mobile',
      'live-grant-revocation','native-logout-revokes-session','revoked-grant-logout'], browserErrors }
  writeFileSync('.cloudflare-ci/site-application.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} catch (error) {
  const dom = currentPage ? await currentPage.evaluate(() => ({ host: location.hostname,path: location.pathname,
    title: document.title,text: document.body.innerText.slice(0,600) })).catch(() => null) : null
  console.log(JSON.stringify({ event: 'site_application_failure',dom,failedAssets,browserErrors: browserErrors.slice(-10) }))
  throw error
} finally { await browser?.close(); await mf.dispose() }
