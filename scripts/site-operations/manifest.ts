import assert from 'node:assert/strict'
import { z } from 'zod'
import { provisionDigest, provisionPlan, provisionUuidSchema, type ProvisionPlan } from '../../src/site-control/provisionPlan'

const name = z.string().regex(/^payload-wnam-[a-z0-9-]{1,48}$/)
const bucket = z.object({ binding: z.string(),bucket_name: z.string().regex(/^[a-z0-9-]{3,63}$/) }).strict()
const database = z.object({ binding: z.string(),database_name: z.string().regex(/^[a-z0-9-]{1,64}$/),database_id: provisionUuidSchema }).strict()
const config = z.object({
  account_id: z.literal('d487cf34c606620b442632a72272014d'),name,main: z.literal('worker.ts'),
  compatibility_date: z.literal('2025-08-15'),compatibility_flags: z.tuple([z.literal('nodejs_compat'),z.literal('global_fetch_strictly_public')]),
  assets: z.object({ directory: z.literal('.open-next/assets'),binding: z.literal('ASSETS') }).strict(),
  workers_dev: z.literal(false),preview_urls: z.literal(false),
  routes: z.array(z.object({ pattern: z.string(),custom_domain: z.literal(true) }).strict()).max(50),
  d1_databases: z.array(database).max(50),r2_buckets: z.array(bucket),
})
export const siteConfig = config.extend({
  vars: z.object({ CENTRAL_ORIGIN: z.string(),WORKER_GROUP: z.string(),SITE_ROUTES: z.string() }).strict(),
  services: z.array(z.object({ binding: z.string(),service: name,entrypoint: z.string() }).strict()),
}).strict()
export const centralConfig = config.extend({ vars: z.object({ CENTRAL_ORIGIN: z.string() }).strict() }).strict()
const routeSchema = z.object({ siteId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/),localSiteId: z.number().int().positive(),
  bindingName: z.string().regex(/^SITE_D1_[A-Z0-9_]{1,48}$/),databaseId: provisionUuidSchema,schemaVersion: z.number().int().positive() }).strict()
export type GroupManifest = z.infer<typeof siteConfig>
export type ProvisionRequest = { plan: ProvisionPlan; baseline: GroupManifest; central: z.infer<typeof centralConfig>; centralWorkerTag: string; zoneId: string }

export function groupRoutes(manifest: GroupManifest) {
  const routes = z.array(routeSchema).max(50).parse(JSON.parse(manifest.vars.SITE_ROUTES))
  for (const key of ['siteId','localSiteId','bindingName','databaseId'] as const) assert.equal(new Set(routes.map(route => route[key])).size,routes.length,`Duplicate group ${key}`)
  assert.equal(routes.length,manifest.d1_databases.length,'Group binding count mismatch')
  assert.deepEqual(manifest.routes,routes.map(route => ({ pattern: `cms-site-${route.siteId}.beginos.org`,custom_domain: true })))
  for (const [index,route] of routes.entries()) {
    assert.equal(manifest.d1_databases[index].binding,route.bindingName)
    assert.equal(manifest.d1_databases[index].database_id,route.databaseId)
  }
  return routes
}

/** Reviewed JSON contains no credentials, arbitrary commands, source paths or
 * implicit resource creation. Keep original property order for existing plan
 * hashes; Zod validates without rewriting the baseline object. */
export function parseProvisionRequest(input: unknown): ProvisionRequest {
  const parsed = z.object({ plan: z.unknown(),baseline: siteConfig,central: centralConfig,
    centralWorkerTag: z.string().regex(/^[a-f0-9]{32}$/),zoneId: z.literal('8d8fd673a6aeacf85360bc9e397d3002') }).strict().parse(input)
  const original = input as { baseline: GroupManifest; central: ProvisionRequest['central'] }
  const plan = provisionPlan(parsed.plan),baseline = structuredClone(original.baseline),central = structuredClone(original.central)
  assert.equal(provisionDigest(JSON.stringify(baseline)),plan.baselineManifestDigest,'Baseline manifest digest mismatch')
  assert.equal(baseline.name,plan.workerName); assert.equal(baseline.vars.WORKER_GROUP,plan.workerGroup)
  assert.equal(baseline.vars.CENTRAL_ORIGIN,plan.centralOrigin); assert.equal(central.vars.CENTRAL_ORIGIN,plan.centralOrigin)
  assert.deepEqual(central.routes,[{ pattern: new URL(plan.centralOrigin).hostname,custom_domain: true }])
  assert.equal(central.d1_databases.length,1); assert.equal(central.d1_databases[0].binding,'CENTRAL_D1')
  assert.equal(central.d1_databases[0].database_id,plan.centralDatabaseId)
  assert.deepEqual(central.r2_buckets.map(bucket => bucket.binding).sort(),['CENTRAL_MEDIA','MASTER_ASSET_ARCHIVE'])
  assert.deepEqual(baseline.r2_buckets.map(bucket => bucket.binding).sort(),['SITE_PRIVATE','SITE_PUBLIC'])
  assert.equal(new Set([...central.r2_buckets,...baseline.r2_buckets].map(bucket => bucket.bucket_name)).size,4,'Role buckets must be distinct')
  assert.deepEqual(baseline.services,[['IDENTITY','SiteIdentityService'],['DATA','SiteDataService'],['ROUTING','SiteRoutingService']]
    .map(([binding,entrypoint]) => ({ binding,entrypoint,service: central.name })))
  const routes = groupRoutes(baseline)
  assert.ok(routes.length < 50 && !routes.some(route => route.siteId === plan.siteId || route.localSiteId === plan.localSiteId || route.bindingName === plan.bindingName),'Provision target already in baseline or group full')
  return { plan,baseline,central,centralWorkerTag: parsed.centralWorkerTag,zoneId: parsed.zoneId }
}

export function provisionManifest(request: ProvisionRequest,databaseId: string): GroupManifest {
  provisionUuidSchema.parse(databaseId)
  const { plan } = request,manifest = structuredClone(request.baseline)
  const routes = groupRoutes(manifest)
  assert.ok(!routes.some(route => route.databaseId === databaseId),'Provision database already bound')
  routes.push({ siteId: plan.siteId,localSiteId: plan.localSiteId,bindingName: plan.bindingName,databaseId,schemaVersion: plan.schemaVersion })
  manifest.d1_databases.push({ binding: plan.bindingName,database_name: plan.databaseName,database_id: databaseId })
  manifest.routes.push({ pattern: plan.adminHost,custom_domain: true })
  manifest.vars.SITE_ROUTES = JSON.stringify(routes)
  groupRoutes(manifest)
  return manifest
}
