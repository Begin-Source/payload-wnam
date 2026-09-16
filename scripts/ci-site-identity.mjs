import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { realpathSync, readdirSync, writeFileSync } from 'node:fs'

if (process.env.WORKERS_CI !== '1') throw new Error('Identity runtime bundling/tests run only in Cloudflare Builds')
const require = createRequire(realpathSync(resolve('node_modules/wrangler/package.json')))
const { Miniflare } = require('miniflare')
const paths = {}
for (const role of ['central', 'site']) {
  const outputDir = resolve(`.cloudflare-ci/site-identity-${role}`)
  execFileSync('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--config', `tests/runtime/wrangler-identity-${role}.jsonc`, '--outdir', outputDir], { stdio: 'inherit' })
  const entries = readdirSync(outputDir).filter(name => /\.m?js$/.test(name))
  assert.equal(entries.length, 1, `Expected one ${role} runtime entry`)
  paths[role] = resolve(outputDir, entries[0])
}
const loginToken = randomBytes(32).toString('hex')
const mf = new Miniflare({ workers: [
  { name: 'site', modules: true, scriptPath: paths.site, compatibilityDate: '2025-08-15', compatibilityFlags: ['nodejs_compat'],
    serviceBindings: { IDENTITY: { name: 'central', entrypoint: 'SiteIdentityService' } },
    d1Databases: { SITE_A: 'identity-site-a', SITE_B: 'identity-site-b' } },
  { name: 'central', modules: true, scriptPath: paths.central, compatibilityDate: '2025-08-15', compatibilityFlags: ['nodejs_compat'],
    bindings: { FIXTURE_LOGIN_TOKEN: loginToken }, d1Databases: { CENTRAL_D1: 'identity-central' } },
] })
try {
  // Import schema-only TS in the CI orchestrator; no application configuration or boot hooks.
  const { migrateSiteControl } = await import('../src/site-control/schema.ts')
  const { registerSite } = await import('../src/site-control/registry.ts')
  const db = await mf.getD1Database('CENTRAL_D1', 'central')
  await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, lock_until TEXT)')
  await db.exec('CREATE TABLE users_sessions (id TEXT PRIMARY KEY, _parent_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL)')
  await migrateSiteControl(db)
  await db.prepare('INSERT INTO users VALUES (7, ?, NULL)').bind('staff@example.invalid').run()
  await db.prepare('INSERT INTO users_sessions VALUES (?,7,?)').bind('fixture-original-session', new Date(Date.now() + 3600_000).toISOString()).run()
  for (const [index, site] of ['a', 'b'].entries()) {
    await registerSite(db, { siteId: site, databaseId: `${String(index + 1).repeat(8)}-1111-4111-8111-111111111111`,
      bindingName: `SITE_D1_${site.toUpperCase()}`, workerGroup: 'test-group', adminHost: `cms-site-${site}.beginos.org`,
      schemaVersion: 1, routingVersion: 1, migrationState: 'active', timezone: 'UTC', productionEnabled: false, operationId: `fixture-${site}` })
    await db.prepare('INSERT INTO site_runtime_access VALUES (?, ?, ?)').bind(site, '7', 'editor').run()
    const siteDB = await mf.getD1Database(`SITE_${site.toUpperCase()}`, 'site')
    await siteDB.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, central_user_id TEXT UNIQUE, display_name TEXT NOT NULL)')
    await siteDB.prepare('INSERT INTO users VALUES (1, ?, ?)').bind('7', `Stored ${site}`).run()
  }
  const central = await mf.getWorker('central')
  const site = await mf.getWorker('site')
  const form = (origin, body, cookie) => ({ method: 'POST', redirect: 'manual', headers: {
    origin, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}),
  }, body })
  const issue = async target => {
    const response = await central.fetch('https://hub.beginos.org/auth/enter-site', form('https://hub.beginos.org', `siteId=${target}`, `fixture-central=${loginToken}`))
    assert.equal(response.status, 200, 'Central fixture issuance failed')
    assert.match(response.headers.get('cache-control'), /no-store/)
    const html = await response.text()
    const ticket = html.match(/name="ticket" value="([0-9a-f]{64})"/)?.[1]
    assert.ok(ticket, 'POST handoff ticket absent')
    return ticket
  }
  const redeem = (target, ticket, origin = 'https://hub.beginos.org') => site.fetch(`https://cms-site-${target}.beginos.org/auth/site-login`, form(origin, `ticket=${ticket}`))
  const me = (target, cookie, init = {}) => site.fetch(`https://cms-site-${target}.beginos.org/api/me`, { ...init, headers: { cookie, ...init.headers } })
  assert.equal((await central.fetch('https://hub.beginos.org/auth/enter-site', form('https://hub.beginos.org', 'siteId=a&userId=7', `fixture-central=${loginToken}`))).status, 400)
  assert.equal((await central.fetch('https://hub.beginos.org/auth/enter-site', form('https://hub.beginos.org', 'siteId=a'))).status, 401)
  const ticketA = await issue('a')
  assert.equal((await redeem('b', ticketA)).status, 403)
  assert.equal((await redeem('a', ticketA, 'https://cms-site-b.beginos.org')).status, 403)
  const attempts = await Promise.all(Array.from({ length: 20 }, () => redeem('a', ticketA)))
  const winners = attempts.filter(response => response.status === 303)
  assert.equal(winners.length, 1, 'Concurrent RPC ticket replay accepted')
  assert.equal(attempts.filter(response => response.status === 403).length, 19)
  const cookieA = winners[0].headers.get('set-cookie').split(';')[0]
  assert.equal(winners[0].headers.get('location'), '/admin')
  assert.ok(!winners[0].headers.get('set-cookie').includes('Domain='))
  const responseB = await redeem('b', await issue('b'))
  assert.equal(responseB.status, 303)
  const cookieB = responseB.headers.get('set-cookie').split(';')[0]
  await Promise.all(Array.from({ length: 20 }, async (_, i) => {
    const target = i % 2 ? 'a' : 'b'
    const response = await me(target, target === 'a' ? cookieA : cookieB)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 1, centralUserId: '7', displayName: 'staff@example.invalid',
      collection: 'users', _strategy: 'central-site-session', siteId: target, siteRole: 'editor' })
  }))
  assert.equal((await me('b', cookieA)).status, 403)
  assert.equal((await me('a', cookieA, { method: 'POST', headers: { origin: 'https://cms-site-b.beginos.org' } })).status, 403)
  assert.equal((await site.fetch('https://cms-site-a.beginos.org/test/no-issuer')).status, 200)
  assert.equal((await site.fetch('https://cms-site-a.beginos.org/test/no-http')).status, 404)
  // Exercise actual Chromium form navigation, CSP, redirect and cookie rules.
  // Only the network edge is bridged to the isolated workers; RPC remains native.
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext()
    await context.addCookies([{ name: 'fixture-central', value: loginToken, domain: 'hub.beginos.org', path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }])
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      assert.ok(!url.search, 'Session flow must not place credentials in URLs')
      const target = url.hostname === 'hub.beginos.org' ? central : site
      const response = await target.fetch(request.url(), { method: request.method(), headers: await request.allHeaders(),
        ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}), redirect: 'manual' })
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    })
    for (const target of ['a', 'b']) {
      const page = await context.newPage()
      await page.goto('https://hub.beginos.org/')
      await page.evaluate(target => {
        const form = document.createElement('form')
        form.method = 'POST'; form.action = '/auth/enter-site'
        const input = document.createElement('input'); input.name = 'siteId'; input.value = target
        form.append(input); document.body.append(form); form.submit()
      }, target)
      await page.waitForURL('https://cms-site-' + target + '.beginos.org/admin')
      assert.equal(JSON.parse(await page.locator('body').innerText()).siteId, target)
    }
    const cookiesA = await context.cookies('https://cms-site-a.beginos.org')
    const cookiesB = await context.cookies('https://cms-site-b.beginos.org')
    assert.equal(cookiesA.length, 1)
    assert.equal(cookiesB.length, 1)
    assert.equal(cookiesA[0].name, '__Host-site-session')
    assert.equal(cookiesA[0].httpOnly, true)
    assert.equal(cookiesA[0].secure, true)
    assert.notEqual(cookiesA[0].value, cookiesB[0].value)
    assert.deepEqual(await context.cookies('https://public.example'), [])
    await context.close()
  } finally { await browser.close() }
  await db.prepare("UPDATE site_runtime_access SET role = 'viewer' WHERE site_id = 'a'").run()
  assert.equal((await (await me('a', cookieA)).json()).siteRole, 'viewer')
  await db.prepare("DELETE FROM site_runtime_access WHERE site_id = 'a'").run()
  assert.equal((await me('a', cookieA)).status, 403)
  assert.equal((await me('b', cookieB)).status, 200)
  const logout = await site.fetch('https://cms-site-b.beginos.org/auth/site-logout', form('https://cms-site-b.beginos.org', '', cookieB))
  assert.equal(logout.status, 303)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await me('b', cookieB)).status, 403)
  const renewed = await redeem('b', await issue('b'))
  const renewedCookie = renewed.headers.get('set-cookie').split(';')[0]
  await db.prepare('DELETE FROM users_sessions').run()
  assert.equal((await me('b', renewedCookie)).status, 403)
  // D1 outage: no cached principal can grant access; public handler needs no RPC.
  await db.exec('DROP TABLE users_sessions')
  assert.equal((await me('b', renewedCookie)).status, 403)
  assert.equal((await site.fetch('https://public.example/article')).status, 200)
  const report = { event: 'site_identity_workerd_rpc', ok: true,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workers: 2, databases: 3, concurrentRedemptions: 20, concurrentSiteRequests: 20,
    checks: ['named RPC capability', 'no RPC issuer', 'HTTP capability denied', 'POST handoff', 'Chromium form/CSP/cookie navigation', 'single-use ticket',
      'host/origin binding', 'credential-free projections', 'live role changes', 'immediate revocation', 'site logout',
      'central logout', 'central outage fails closed', 'independent public response'],
    scope: 'Cloudflare Builds native workerd service bindings and D1; synthetic central login and site identity collection; Chromium network edge bridged into native workerd; not deployed independent Payload configs or production browser acceptance' }
  writeFileSync('.cloudflare-ci/site-identity.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { await mf.dispose() }
