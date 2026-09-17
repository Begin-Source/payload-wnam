import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { P1_ACCOUNT, P1_ORIGIN, P1_EMAIL } from './p1-manifests.mjs'
import { p1EffectiveManifests } from './p1-release-manifests.mjs'
import { checkLifecycleBrowser } from './p1-lifecycle-browser.mjs'
import { checkMcpBrowser } from './p1-mcp-browser.mjs'

assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
const password = process.env.P1_TEST_PASSWORD, token = process.env.CLOUDFLARE_API_TOKEN
assert.ok(password && password.length >= 32 && token)
const { central,site } = p1EffectiveManifests()
const routes = JSON.parse(site.vars.SITE_ROUTES)
const hosts = [new URL(P1_ORIGIN).hostname,...site.routes.map(route => route.pattern)]
const centralQuery = async (sql,params = []) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${P1_ACCOUNT}/d1/database/${central.d1_databases[0].database_id}/query`,{
    method: 'POST',headers: { authorization: `Bearer ${token}`,'content-type': 'application/json' },body: JSON.stringify({ sql,params }),signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  if (!response.ok || !result.success || result.result.some(item => !item.success)) throw new Error(`P1 smoke control query failed (${response.status})`)
  return result.result[0].results
}
let browser, context, currentPage, mcp, revokeAttempted = false
const pendingRevocations = new Set()
const browserErrors = [],failedAssets = []
const invoke = (page,path,init = {}) => page.evaluate(async ({ path,init }) => {
  const response = await fetch(path,init)
  return { status: response.status,cacheControl: response.headers.get('cache-control'),body: await response.text() }
},{ path,init })
try {
  // Real DNS, real Cloudflare Workers, real TLS. No host resolver, Miniflare,
  // proxy to a fixture, or certificate-error suppression in remote acceptance.
  browser = await chromium.launch({ headless: true,args: ['--disable-background-networking'] })
  context = await browser.newContext({ serviceWorkers: 'block',viewport: { width: 1365,height: 900 } })
  context.setDefaultTimeout(30000)
  context.setDefaultNavigationTimeout(60000)
  await context.route('**/*',route => hosts.includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  context.on('page',page => {
    page.on('pageerror',error => browserErrors.push(error.message.slice(0,240)))
    page.on('response',response => { if (response.url().includes('/_next/') && response.status() >= 400) failedAssets.push(new URL(response.url()).pathname) })
  })
  const hub = currentPage = await context.newPage()
  assert.equal((await hub.goto(`${P1_ORIGIN}/admin/login`)).status(),200)
  await hub.locator('form[data-form-ready="true"]').waitFor()
  await hub.waitForLoadState('networkidle')
  await hub.locator('input[name=email]').fill(P1_EMAIL)
  await hub.locator('input[name=password]').fill(password)
  await hub.waitForTimeout(500)
  const authenticated = hub.waitForResponse(response => new URL(response.url()).pathname === '/api/users/login' && response.request().method() === 'POST')
  await hub.locator('button[type=submit]').click()
  assert.equal((await authenticated).status(),200)
  await hub.waitForURL(url => url.pathname === '/admin',{ timeout: 60000 })
  console.log(JSON.stringify({ event: 'p1_remote_central_login_passed' }))
  const pages = {},docs = {}
  for (const route of routes) {
    const id = route.siteId
    const page = currentPage = await context.newPage()
    await page.goto(`${P1_ORIGIN}/admin`)
    const chooser = page.getByRole('region',{ name: '我的网站' })
    await chooser.locator(`[data-site-id="${id}"]`).getByRole('button',{ name: /^进入网站 / }).click()
    await page.waitForURL(url => url.hostname === `cms-site-${id}.beginos.org` && url.pathname === '/admin',{ timeout: 60000 })
    await page.getByRole('navigation').first().waitFor({ timeout: 45000 })
    await page.waitForLoadState('networkidle')
    pages[id] = page
    const me = await invoke(page,'/api/users/me')
    assert.equal(me.status,200); assert.equal(JSON.parse(me.body).user.siteId,id); assert.equal(JSON.parse(me.body).user.centralUserId,'7')
    // Stable reserved synthetic content ID. A retry updates only a record whose
    // slug proves it belongs to this smoke; unrelated content is never adopted.
    const documentId = 990001,slug = 'p1-remote-isolation-probe'
    const existing = await invoke(page,`/api/categories/${documentId}?depth=0`)
    assert.ok([200,404].includes(existing.status))
    if (existing.status === 200) assert.equal(JSON.parse(existing.body).slug,slug,'Synthetic content ownership conflict')
    const body = { id: documentId,name: `Remote site ${id}`,slug,locale: 'en',site: route.localSiteId }
    const created = await invoke(page,existing.status === 200 ? `/api/categories/${documentId}` : '/api/categories',{
      method: existing.status === 200 ? 'PATCH' : 'POST',headers: { 'content-type': 'application/json','x-site-id': id === 'p1-a' ? 'p1-b' : 'p1-a' },body: JSON.stringify(body),
    })
    assert.equal(created.status,existing.status === 200 ? 200 : 201,`P1 ${id} category write (${created.status})`)
    docs[id] = JSON.parse(created.body).doc
    assert.equal(docs[id].id,documentId); assert.match(created.cacheControl,/no-store/)
    assert.equal((await invoke(page,'/api/users/login',{ method: 'POST',headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: P1_EMAIL,password }) })).status,403,'Site must reject valid central passwords')
    await page.goto(`https://cms-site-${id}.beginos.org/admin/collections/categories/${documentId}`)
    await page.locator('form[data-form-ready="true"]').waitFor()
    assert.equal(await page.locator('input[name=name]').inputValue(),`Remote site ${id}`)
    await page.screenshot({ path: `.cloudflare-ci/remote-${id}-desktop.png`,fullPage: true })
    console.log(JSON.stringify({ event: 'p1_remote_site_editor_passed',siteId: id }))
  }
  const results = await Promise.all(Array.from({ length: 20 },(_,index) => {
    const id = routes[index % routes.length].siteId
    return invoke(pages[id],`/api/categories/${docs[id].id}?depth=0`).then(result => ({ id,result }))
  }))
  for (const { id,result } of results) { assert.equal(result.status,200); assert.equal(JSON.parse(result.body).name,`Remote site ${id}`) }
  const changed = await invoke(pages['p1-a'],'/api/categories/990001',{ method: 'PATCH',headers: { 'content-type': 'application/json' },body: JSON.stringify({ name: 'Changed only P1 A' }) })
  assert.equal(changed.status,200)
  for (const { siteId: id } of routes.filter(route => route.siteId !== 'p1-a')) assert.equal(JSON.parse((await invoke(pages[id],'/api/categories/990001')).body).name,`Remote site ${id}`)
  const cookies = (await context.cookies()).filter(cookie => cookie.name === '__Host-site-session')
  assert.deepEqual(cookies.map(cookie => cookie.domain).sort(),hosts.slice(1).sort())
  assert.ok(cookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict' && cookie.path === '/'))
  for (const { siteId: id } of routes.filter(route => route.siteId !== 'p1-b')) {
    currentPage = pages[id]
    await currentPage.setViewportSize({ width: 390,height: 844 })
    assert.equal(await currentPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true)
    await currentPage.screenshot({ path: `.cloudflare-ci/remote-${id}-mobile.png`,fullPage: true })
  }
  for (const { siteId: id } of routes.filter(route => !['p1-a','p1-b'].includes(route.siteId))) {
    pendingRevocations.add(id)
    await centralQuery('DELETE FROM site_runtime_access WHERE site_id=? AND user_id=?',[id,'7'])
    assert.equal((await invoke(pages[id],'/api/categories/990001')).status,403)
    assert.equal((await invoke(pages[id],'/api/categories/990001',{ method: 'PATCH',headers: { 'content-type': 'application/json' },body: JSON.stringify({ name: 'Denied' }) })).status,403)
    const others = routes.filter(route => route.siteId !== id).map(route => route.siteId)
    for (const other of others) assert.equal((await invoke(pages[other],'/api/categories/990001')).status,200)
    await centralQuery("INSERT INTO site_runtime_access (site_id,user_id,role) VALUES (?,'7','manager') ON CONFLICT(site_id,user_id) DO UPDATE SET role='manager'",[id])
    pendingRevocations.delete(id)
    console.log(JSON.stringify({ event: 'p1_new_site_revocation_passed',siteId: id,otherSitesUnaffected: others }))
  }
  currentPage = hub
  await checkLifecycleBrowser({ hub,siteId: 'p1-a',otherSiteId: 'p1-b',artifactPrefix: '.cloudflare-ci/remote-lifecycle',
    siteRequest: () => invoke(pages['p1-a'],'/api/categories/990001'),otherSiteRequest: () => invoke(pages['p1-b'],'/api/categories/990001') })
  mcp = await checkMcpBrowser({ hub,siteId: 'p1-a',otherSiteId: 'p1-b',
    siteRequest: () => invoke(pages['p1-a'],'/api/categories/990001'),otherSiteRequest: () => invoke(pages['p1-b'],'/api/categories/990001') })
  // A lifecycle change invalidated the old cookie. Enter again through the real
  // chooser before the independent grant-revocation/logout acceptance checks.
  await pages['p1-a'].goto(`${P1_ORIGIN}/admin`)
  await pages['p1-a'].locator('[data-site-id="p1-a"]').getByRole('button',{ name: /^进入网站 / }).click()
  await pages['p1-a'].waitForURL(url => url.hostname === 'cms-site-p1-a.beginos.org' && url.pathname === '/admin',{ timeout: 60000 })
  assert.equal((await invoke(pages['p1-a'],'/api/categories/990001')).status,200)
  assert.deepEqual(failedAssets,[]); assert.deepEqual(browserErrors,[])
  revokeAttempted = true
  await centralQuery("DELETE FROM site_runtime_access WHERE site_id='p1-a' AND user_id='7'")
  await mcp.assertRevokedSite()
  assert.equal((await invoke(pages['p1-a'],'/api/categories/990001')).status,403)
  assert.equal((await invoke(pages['p1-a'],'/api/categories/990001',{ method: 'PATCH',headers: { 'content-type': 'application/json' },body: JSON.stringify({ name: 'Denied' }) })).status,403)
  assert.equal((await invoke(pages['p1-b'],'/api/categories/990001')).status,200)
  const logout = pages['p1-b'].waitForResponse(response => new URL(response.url()).pathname === '/api/users/logout' && response.request().method() === 'POST')
  await pages['p1-b'].goto('https://cms-site-p1-b.beginos.org/admin/logout')
  assert.equal((await logout).status(),200)
  for (const { siteId: id } of routes.filter(route => route.siteId !== 'p1-b')) assert.equal((await invoke(pages[id],'/api/users/logout',{ method: 'POST' })).status,200)
  assert.equal((await context.cookies()).some(cookie => cookie.name === '__Host-site-session'),false)
  const revoked = await fetch('https://cms-site-p1-b.beginos.org/api/categories/990001',{
    headers: { cookie: `__Host-site-session=${cookies.find(cookie => cookie.domain === hosts[2]).value}` },redirect: 'manual',signal: AbortSignal.timeout(10000),
  })
  assert.equal(revoked.status,403); await revoked.body?.cancel()
  assert.equal((await invoke(hub,'/api/users/logout',{ method: 'POST' })).status,200)
  await mcp.assertRevokedSession()
  const report = { event: 'p1_remote_smoke_passed',checkedAt: new Date().toISOString(),remoteDeployment: true,
    sites: routes.map(route => route.siteId),checks: ['real-dns-tls','independent-central-site-workers','real-d1-schemas','central-password-login','chooser-sso-group','new-site-live-revocation','host-only-cookies',
      'native-editors','same-id-20-concurrent-reads','isolated-create-update','site-password-denied','manager-pause-resume','ambiguous-lifecycle-retry','routing-version-cookie-revocation',
      'live-grant-revocation','native-logout-central-revocation','desktop-mobile','real-sdk-mcp','explicit-site-mcp','mcp-lifecycle','mcp-grant-revocation','mcp-central-logout'],browserErrors }
  writeFileSync('.cloudflare-ci/p1-remote-smoke.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
} catch (error) {
  const dom = currentPage ? await currentPage.evaluate(() => ({ host: location.hostname,path: location.pathname,title: document.title,text: document.body.innerText.slice(0,600) })).catch(() => null) : null
  console.log(JSON.stringify({ event: 'p1_remote_smoke_failed',dom,failedAssets,browserErrors: browserErrors.slice(-10) }))
  throw error
} finally {
  // No permanent permission change from a smoke, including if the network
  // failed after the DELETE was committed but before returning its response.
  try {
    for (const id of pendingRevocations) await centralQuery("INSERT INTO site_runtime_access (site_id,user_id,role) VALUES (?,'7','manager') ON CONFLICT(site_id,user_id) DO UPDATE SET role='manager'",[id])
    if (revokeAttempted) await centralQuery("INSERT INTO site_runtime_access (site_id,user_id,role) VALUES ('p1-a','7','manager') ON CONFLICT(site_id,user_id) DO UPDATE SET role='manager'")
  } finally { await mcp?.close(); await context?.close(); await browser?.close() }
}
