import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { z } from 'zod'
import type { ProvisionPlan } from '../../src/site-control/provisionPlan'

/** Owner credentials remain in cloud environment memory. This exercises the
 * actual central form, chooser, ticket exchange and native site admin. It does
 * not change grants, content, passwords or a human's other sessions. */
export async function provisionBrowserAcceptance(plan: ProvisionPlan,credentials = { email: process.env.SITE_PROVISION_EMAIL,password: process.env.SITE_PROVISION_PASSWORD }) {
  assert.equal(process.env.WORKERS_CI,'1','Provision acceptance runs only in Cloudflare Builds')
  const { email,password } = credentials
  assert.ok(email && password,'Cloud owner credentials required for provision acceptance')
  const browser = await chromium.launch({ headless: true,args: ['--disable-background-networking'] })
  const context = await browser.newContext({ serviceWorkers: 'block',viewport: { width: 1365,height: 900 } })
  context.setDefaultTimeout(30000); context.setDefaultNavigationTimeout(60000)
  const allowed = [new URL(plan.centralOrigin).hostname,plan.adminHost]
  await context.route('**/*',route => allowed.includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const hub = await context.newPage(),site = await context.newPage()
  const errors: string[] = [],failedAssets: string[] = []
  for (const page of [hub,site]) {
    page.on('pageerror',error => errors.push(error.name))
    page.on('response',response => { if (new URL(response.url()).pathname.startsWith('/_next/') && response.status() >= 400) failedAssets.push(new URL(response.url()).pathname) })
  }
  let centralLogin = false,siteLogin = false
  const logout = async (page: typeof hub) => page.evaluate(async () => (await fetch('/api/users/logout',{ method: 'POST' })).status)
  try {
    assert.equal((await hub.goto(`${plan.centralOrigin}/admin/login`))?.status(),200)
    await hub.locator('form[data-form-ready="true"]').waitFor(); await hub.waitForLoadState('networkidle')
    await hub.locator('input[name=email]').fill(email); await hub.locator('input[name=password]').fill(password)
    const authenticated = hub.waitForResponse(response => new URL(response.url()).pathname === '/api/users/login' && response.request().method() === 'POST')
    await hub.locator('button[type=submit]').click(); assert.equal((await authenticated).status(),200); centralLogin = true
    await hub.waitForURL(url => url.pathname === '/admin')
    const owner = await hub.evaluate(async () => { const r = await fetch('/api/users/me'); return { status: r.status,body: await r.json() } })
    assert.equal(owner.status,200)
    assert.equal(z.object({ user: z.object({ id: z.number() }) }).parse(owner.body).user.id,plan.ownerUserId)
    await site.goto(`${plan.centralOrigin}/admin`)
    await site.locator(`[data-site-id="${plan.siteId}"]`).getByRole('button',{ name: /^进入网站 / }).click()
    await site.waitForURL(url => url.hostname === plan.adminHost && url.pathname === '/admin'); siteLogin = true
    await site.getByRole('navigation').first().waitFor(); await site.waitForLoadState('networkidle')
    const identity = await site.evaluate(async () => { const r = await fetch('/api/users/me'); return { status: r.status,body: await r.json() } })
    assert.equal(identity.status,200)
    const principal = z.object({ user: z.object({ siteId: z.string(),centralUserId: z.string() }) }).parse(identity.body).user
    assert.equal(principal.siteId,plan.siteId); assert.equal(principal.centralUserId,String(plan.ownerUserId))
    await site.goto(`https://${plan.adminHost}/admin/collections/sites/${plan.localSiteId}`)
    await site.locator('form[data-form-ready="true"]').waitFor()
    await site.setViewportSize({ width: 390,height: 844 })
    assert.ok(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const cookies = (await context.cookies()).filter(cookie => cookie.name === '__Host-site-session')
    assert.equal(cookies.length,1); assert.equal(cookies[0].domain,plan.adminHost)
    assert.ok(cookies[0].httpOnly && cookies[0].secure && cookies[0].sameSite === 'Strict' && cookies[0].path === '/')
    assert.deepEqual(errors,[]); assert.deepEqual(failedAssets,[])
    assert.equal(await logout(site),200); siteLogin = false
    assert.equal(await logout(hub),200); centralLogin = false
    console.log(JSON.stringify({ event: 'provision_browser_acceptance_passed',operationId: plan.operationId,siteId: plan.siteId,
      checks: ['real-tls','owner-login','chooser-ticket','site-principal','native-site-editor','host-only-cookie','mobile','logout'] }))
  } finally {
    try { if (siteLogin && new URL(site.url()).hostname === plan.adminHost) await logout(site) }
    finally { try { if (centralLogin) await logout(hub) } finally { await context.close(); await browser.close() } }
  }
}
