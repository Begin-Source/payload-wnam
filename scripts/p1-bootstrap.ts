import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { getPayload } from 'payload'
import type { User } from '../src/payload-types'
import { getPlatformProxy } from 'wrangler'
import { migrateCentralRoleState, migrateSiteRoleState } from '../src/application-roles/schema'
import { createCentralPayloadConfig } from '../src/site-control/config'
import { createSitePayloadConfig } from '../src/site-runtime/config'
import { registerSite } from '../src/site-control/registry'
import { withSiteContext } from '../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../src/site-runtime/identityProjection'
import { OpenAIConfig } from '../src/utilities/aiOpenAIConfigImport'
import { applyP1Schema, type RoleSchema } from './p1-schema'
import { p1Manifests, P1_ACCOUNT, P1_EMAIL } from './p1-manifests.mjs'

const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_BRANCH !== 'feat/site-per-d1' ||
  process.env.WORKERS_CI_COMMIT_SHA !== commit || process.env.PAYLOAD_P1_BOOTSTRAP !== '1' ||
  JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit !== commit) throw new Error('P1 bootstrap requires the checked Cloudflare release')
const password = process.env.P1_TEST_PASSWORD, secret = process.env.P1_CENTRAL_SECRET
if (!password || password.length < 32 || !secret || secret.length < 32) throw new Error('P1 bootstrap credentials unavailable')
type Manifest = {
  compatibility_date: string; compatibility_flags: string[]
  d1_databases: { binding: string; database_name: string; database_id: string }[]
  r2_buckets: { binding: string; bucket_name: string }[]
  vars: { WORKER_GROUP: string; SITE_ROUTES: string }
}
const { central,site } = p1Manifests() as { central: Manifest; site: Manifest }
// The maintenance proxy binds only storage. There is no unauthenticated HTTP
// bootstrap route and no need for the central Worker to exist yet.
const maintenance = { name: 'payload-wnam-p1-maintenance',account_id: P1_ACCOUNT,
  compatibility_date: central.compatibility_date,compatibility_flags: central.compatibility_flags,
  d1_databases: [...central.d1_databases,...site.d1_databases].map(db => ({ ...db,remote: true })),
  r2_buckets: [...central.r2_buckets,...site.r2_buckets].map(bucket => ({ ...bucket,remote: true })),
}
writeFileSync('.cloudflare-ci/p1-maintenance.json',JSON.stringify(maintenance))
const proxy = await getPlatformProxy({ configPath: '.cloudflare-ci/p1-maintenance.json',remoteBindings: true,persist: false })
const env = proxy.env as unknown as { CENTRAL_D1: D1Database; CENTRAL_MEDIA: R2Bucket; SITE_PUBLIC: R2Bucket; SITE_PRIVATE: R2Bucket; [key: `SITE_D1_${string}`]: D1Database }
const receipts = []
let centralPayload: Awaited<ReturnType<typeof getPayload>> | undefined, sitePayload: typeof centralPayload
try {
  for (const [role,binding] of [['central','CENTRAL_D1'],['site-a','SITE_D1_A'],['site-b','SITE_D1_B']] as const) {
    const schema = JSON.parse(readFileSync(`.cloudflare-ci/role-${role}-schema.json`,'utf8')) as RoleSchema
    assert.equal(schema.role,role)
    receipts.push(await applyP1Schema(env[binding],schema,`p1-${role}-schema-v1`))
    if (role === 'central') await migrateCentralRoleState(env[binding])
    else await migrateSiteRoleState(env[binding])
    // Validate that all explicit runtime migrations were represented by the
    // checked schema artifact, including after resuming a partial seed.
    await applyP1Schema(env[binding],schema,`p1-${role}-schema-v1`)
    const singleton = role === 'central' ?
      await env[binding].prepare('SELECT revision AS value FROM central_cost_epoch WHERE id=1').first<{ value: number }>() :
      await env[binding].prepare('SELECT high_id AS value FROM site_asset_id_watermark WHERE singleton=1').first<{ value: number }>()
    assert.ok(singleton && Number.isSafeInteger(singleton.value) && singleton.value >= 0,'P1 runtime counters unavailable')
    console.log(JSON.stringify({ event: 'p1_schema_ready',...receipts.at(-1) }))
  }
  const config = await createCentralPayloadConfig({ database: env.CENTRAL_D1,bucket: env.CENTRAL_MEDIA,secret,
    generationModels: OpenAIConfig.models,authorizeAiGeneration: async () => false })
  centralPayload = await getPayload({ config,key: 'p1-central-bootstrap',disableOnInit: true })
  const payload = centralPayload
  // Dedicated synthetic account only. Never rotate a human user's password or
  // silently adopt an already populated database as this test environment.
  const users = await payload.find({ collection: 'users',limit: 2,depth: 0 })
  assert.ok(users.totalDocs <= 1 && users.docs.every(user => user.id === 7 && user.email === P1_EMAIL),'P1 synthetic account ownership conflict')
  for (const id of [1,2]) {
    const found = await payload.find({ collection: 'tenants',where: { id: { equals: id } },limit: 1,depth: 0 })
    const slug = `p1-tenant-${id}`
    if (found.docs.length) assert.equal(found.docs[0].slug,slug)
    else await payload.create({ collection: 'tenants',data: { id,name: `P1 Tenant ${id}`,slug,domain: `${slug}.example.invalid` } })
  }
  const bootstrap = { id: 7,collection: 'users',email: P1_EMAIL,roles: ['super-admin'] } as User & { collection: 'users' }
  const user = users.docs[0] ? await payload.update({ collection: 'users',id: 7,user: bootstrap,data: { password,roles: ['super-admin'] } }) :
    await payload.create({ collection: 'users',user: bootstrap,data: { id: 7,email: P1_EMAIL,password,roles: ['super-admin'],tenants: [{ tenant: 1 },{ tenant: 2 }] } })
  const principal = { ...user,collection: 'users' as const }
  const unavailable = async () => { throw new Error('No external capability during P1 bootstrap') }
  sitePayload = await getPayload({ key: 'p1-sites-bootstrap',disableOnInit: true,config: await createSitePayloadConfig({ secret,
    identity: { authenticate: unavailable,redeem: unavailable,logout: unavailable },
    publicBucket: env.SITE_PUBLIC,privateBucket: env.SITE_PRIVATE,generationModels: OpenAIConfig.models,
    authorizeAiGeneration: async () => false,executeExternalTask: unavailable }) })
  const local = sitePayload
  const routes = JSON.parse(site.vars.SITE_ROUTES) as { siteId: string; localSiteId: number; databaseId: string; bindingName: `SITE_D1_${string}`; schemaVersion: number }[]
  for (const [index,route] of routes.entries()) {
    const tenant = index + 1, adminHost = `cms-site-${route.siteId}.beginos.org`
    await withSiteContext({ ...route,binding: env[route.bindingName],requestHost: adminHost,routingVersion: 1,currentRoutingVersion: () => 1,identity: null },async () => {
      const found = await local.find({ collection: 'tenants',where: { id: { equals: tenant } },limit: 1,depth: 0 })
      if (found.docs.length) assert.equal(found.docs[0].slug,`p1-tenant-${tenant}`)
      else await local.create({ collection: 'tenants',data: { id: tenant,name: `P1 Tenant ${tenant}`,slug: `p1-tenant-${tenant}`,
        centralSource: { recordId: String(tenant),revision: 1,syncedAt: new Date().toISOString() } } as never })
      await syncSiteIdentityProjection({ siteId: route.siteId,localSiteId: route.localSiteId,userId: '7',displayName: 'P1 Staff',role: 'editor',routingVersion: 1 })
      const foundSite = await local.find({ collection: 'sites',where: { id: { equals: route.localSiteId } },limit: 1,depth: 0 })
      if (foundSite.docs.length) assert.equal(foundSite.docs[0].slug,route.siteId)
      else await local.create({ collection: 'sites',data: { id: route.localSiteId,name: `P1 Site ${route.siteId}`,slug: route.siteId,tenant,
        publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
    })
    await registerSite(env.CENTRAL_D1,{ ...route,workerGroup: site.vars.WORKER_GROUP,adminHost,routingVersion: 1,
      migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `p1-provision-${route.siteId}-v1` })
    const found = await payload.find({ collection: 'sites',where: { id: { equals: route.localSiteId } },limit: 1,depth: 0 })
    if (found.docs.length) assert.equal((found.docs[0] as unknown as { runtimeSiteId: string }).runtimeSiteId,route.siteId)
    else await payload.create({ collection: 'sites',user: principal,data: { id: route.localSiteId,name: `P1 Site ${route.siteId}`,tenant,
      runtimeSiteId: route.siteId,primaryDomain: `${route.siteId}.example.invalid`,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
    await env.CENTRAL_D1.prepare(`INSERT INTO site_runtime_access (site_id,user_id,role) VALUES (?,'7','editor')
      ON CONFLICT(site_id,user_id) DO UPDATE SET role='editor'`).bind(route.siteId).run()
  }
  const report = { event: 'p1_bootstrap_passed',commit,checkedAt: new Date().toISOString(),schemas: receipts,siteIds: routes.map(route => route.siteId),syntheticUserId: 7 }
  writeFileSync('.cloudflare-ci/p1-bootstrap.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally {
  await sitePayload?.destroy(); await centralPayload?.destroy(); await proxy.dispose()
}
process.exit(0)
