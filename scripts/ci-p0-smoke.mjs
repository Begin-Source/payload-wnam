import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { browserLibraryEnvironment } from './ci-browser-libs.mjs'

if (process.env.WORKERS_CI !== '1') throw new Error('P0 deployed smoke runs only in Cloudflare Builds')
const gate = process.env.P0_GATE_SECRET
const password = process.env.P0_TEST_PASSWORD
if (!gate || !password) throw new Error('P0 smoke credentials missing')
const fixtures = []
const isolates = new Map()
for (const site of ['a', 'b']) {
  const origin = `https://p0-${site}.beginos.org`
  // DNS/certificate propagation may lag the first custom-domain deployment.
  let response
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      response = await fetch(`${origin}/__p0/session`, { method: 'POST', headers: { authorization: `Bearer ${gate}` }, signal: AbortSignal.timeout(20000) })
      if (response.status === 204) break
    } catch { /* bounded retry for first deployment propagation */ }
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  assert.equal(response?.status, 204, `P0 ${site} gate session`)
  assert.equal((await fetch(`${origin}/admin/login`)).status, 401, 'Unauthenticated admin request must stay behind P0 gate')
  const cookies = [`__Host-p0-access=${gate}`]
  async function request(path, init = {}) {
    const response = await fetch(`${origin}${path}`, {
      ...init, headers: { cookie: cookies.join('; '), origin, ...init.headers }, signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(`P0 ${site} ${init.method ?? 'GET'} ${path}: HTTP ${response.status}; ${detail.errors?.map(e => e.message).join('; ') ?? 'no JSON error'}`)
    }
    const isolate = response.headers.get('x-p0-isolate-id')
    assert.ok(isolate, 'P0 isolate identity missing')
    if (!isolates.has(isolate)) isolates.set(isolate, new Set())
    isolates.get(isolate).add(site)
    return response
  }
  async function json(path, method = 'GET', data) {
    return (await request(path, { method, headers: { 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) })).json()
  }
  const login = await json('/api/users/login', 'POST', { email: 'p0-isolation@example.invalid', password })
  assert.ok(login.token, 'Payload login returns a session token')
  cookies.push(`payload-token=${login.token}`)
  const loginPage = await request('/admin/login')
  assert.match(await loginPage.text(), /<html/)
  const findOrCreate = async (collection, slug, data) => {
    const found = await json(`/api/${collection}?where[slug][equals]=${slug}&depth=0`)
    return found.docs[0] ?? (await json(`/api/${collection}`, 'POST', { slug, ...data })).doc
  }
  const tenant = await findOrCreate('tenants', 'p0-isolation', { name: `P0 ${site}`, domain: `p0-${site}.beginos.org` })
  const record = await findOrCreate('sites', 'p0-isolation', { name: `P0 ${site}`, tenant: tenant.id, primaryDomain: `p0-${site}.beginos.org`, publicLocaleCodes: ['en'], defaultPublicLocale: 'en' })
  const category = await findOrCreate('categories', 'p0-same-slug', { name: `Site ${site}`, tenant: tenant.id, site: record.id, locale: 'en' })
  await json(`/api/categories/${category.id}`, 'PATCH', { name: `Site ${site}` })
  fixtures.push({ site, origin, cookies, request, json, tenant, record, category })
}
assert.equal(fixtures[0].category.id, fixtures[1].category.id, 'test must exercise identical document IDs')
const crossedSession = await fetch(`${fixtures[1].origin}/api/users/me`, {
  headers: { cookie: fixtures[0].cookies.join('; ') },
})
assert.equal((await crossedSession.json()).user, null, 'Site A login session must not authenticate against site B')
await Promise.all(Array.from({ length: 40 }, (_, i) => {
  const fixture = fixtures[i % 2]
  return fixture.json(`/api/categories/${fixture.category.id}?depth=0`).then(doc => assert.equal(doc.name, `Site ${fixture.site}`))
}))
assert.ok([...isolates.values()].some(sites => sites.size === 2), 'No evidence that one deployed isolate served both databases')

// Real Payload media endpoint -> storage plugin -> scoped R2 adapter.
const uploadFilename = `p0-${randomUUID()}.txt`
for (const fixture of fixtures) {
  const data = new FormData()
  data.set('_payload', JSON.stringify({ alt: `P0 ${fixture.site}`, tenant: fixture.tenant.id, site: fixture.record.id }))
  data.set('file', new Blob([`P0 upload ${fixture.site}`], { type: 'text/plain' }), uploadFilename)
  const uploaded = await (await fixture.request('/api/media', { method: 'POST', body: data })).json()
  const media = uploaded.doc
  assert.ok(media.id)
  const downloaded = await fixture.request(`/api/media/file/${encodeURIComponent(media.filename)}`)
  assert.equal(await downloaded.text(), `P0 upload ${fixture.site}`)
  fixture.media = media
}
assert.equal(fixtures[0].media.filename, fixtures[1].media.filename, 'Both sites must upload the same filename')
await fixtures[0].json(`/api/media/${fixtures[0].media.id}`, 'DELETE')
const survivor = await fixtures[1].request(`/api/media/file/${encodeURIComponent(fixtures[1].media.filename)}`)
assert.equal(await survivor.text(), 'P0 upload b')
await fixtures[1].json(`/api/media/${fixtures[1].media.id}`, 'DELETE')

const browser = await chromium.launch({ env: { ...process.env, ...browserLibraryEnvironment() } })
try {
  for (const fixture of fixtures) {
    const context = await browser.newContext()
    await context.addCookies(fixture.cookies.map(cookie => {
      const index = cookie.indexOf('=')
      return { name: cookie.slice(0, index), value: cookie.slice(index + 1), url: fixture.origin, secure: true, httpOnly: true, sameSite: 'Strict' }
    }))
    const page = await context.newPage()
    const response = await page.goto(`${fixture.origin}/admin/collections/categories`, { waitUntil: 'networkidle' })
    assert.equal(response?.status(), 200)
    await page.getByText(`Site ${fixture.site}`, { exact: true }).first().waitFor()
    assert.equal(await page.getByText(`Site ${fixture.site === 'a' ? 'b' : 'a'}`, { exact: true }).count(), 0)
    await context.close()
  }
} finally { await browser.close() }

const report = { event: 'p0_deployed_smoke_passed', commit: process.env.WORKERS_CI_COMMIT_SHA, at: new Date().toISOString(),
  scope: 'Full Next/Payload REST, admin browser, two remote D1, real R2 upload/delete; queue/cache/failure/performance gates still pending', concurrentReads: 40,
  isolatesServingBothSites: [...isolates.values()].filter(sites => sites.size === 2).length }
writeFileSync('.cloudflare-ci/p0-deployed-smoke.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
