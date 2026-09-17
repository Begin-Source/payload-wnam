import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { p1Manifests } from './p1-manifests.mjs'

export function p1ReleaseRequest() {
  const selection = JSON.parse(readFileSync('operations/p1-release.json','utf8'))
  assert.deepEqual(Object.keys(selection),['provisionRequest'])
  assert.match(selection.provisionRequest,/^operations\/provision\/p1-[a-z0-9-]+\.json$/)
  const request = JSON.parse(readFileSync(selection.provisionRequest,'utf8')),source = p1Manifests()
  assert.deepEqual(request.baseline,source.site,'P1 request baseline must retain the reviewed source group')
  assert.deepEqual(request.central,source.central)
  return { path: selection.provisionRequest,request }
}

/** Only a verified cloud controller writes this commit-matched effective
 * manifest. Derive the one additional member from the reviewed request; a
 * generic JSON file cannot add capabilities or change existing members. */
export function p1EffectiveManifests() {
  assert.equal(process.env.WORKERS_CI,'1')
  const source = p1Manifests(),{ request } = p1ReleaseRequest(),plan = request.plan
  const saved = JSON.parse(readFileSync('.cloudflare-ci/p1-effective-site.json','utf8'))
  assert.equal(saved.commit,process.env.WORKERS_CI_COMMIT_SHA); assert.equal(saved.operationId,plan.operationId)
  assert.match(saved.databaseId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
  const expected = structuredClone(source.site),routes = JSON.parse(expected.vars.SITE_ROUTES)
  assert.ok(!routes.some(route => route.siteId === plan.siteId || route.bindingName === plan.bindingName || route.databaseId === saved.databaseId || route.localSiteId === plan.localSiteId))
  expected.d1_databases.push({ binding: plan.bindingName,database_name: `payload-${plan.siteId.slice(0,16)}-${plan.operationId.replaceAll('-','')}`,database_id: saved.databaseId })
  expected.routes.push({ pattern: `cms-site-${plan.siteId}.beginos.org`,custom_domain: true })
  routes.push({ siteId: plan.siteId,localSiteId: plan.localSiteId,bindingName: plan.bindingName,databaseId: saved.databaseId,schemaVersion: plan.schemaVersion })
  expected.vars.SITE_ROUTES = JSON.stringify(routes)
  assert.deepEqual(saved.site,expected)
  assert.equal(saved.manifestDigest,createHash('sha256').update(JSON.stringify(expected)).digest('hex'))
  return { central: source.central,site: expected }
}
