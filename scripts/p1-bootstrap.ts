import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import type { User } from '../src/payload-types'
import { getPlatformProxy } from 'wrangler'
import { migrateCentralRoleState, migrateSiteRoleState } from '../src/application-roles/schema'
import { createCentralPayloadConfig } from '../src/site-control/config'
import { createSitePayloadConfig } from '../src/site-runtime/config'
import { readSiteRegistration, registerSite } from '../src/site-control/registry'
import { withSiteContext } from '../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../src/site-runtime/identityProjection'
import { OpenAIConfig } from '../src/utilities/aiOpenAIConfigImport'
import { commitMasterRelease } from '../src/site-control/masterPublisher'
import { masterDigest,masterReference,projectMasterData } from '../src/site-control/masterSnapshot'
import { commitConfigRelease } from '../src/site-control/configPublisher'
import { configReference,projectConfigData,verifyConfigRelease,type ConfigRelease } from '../src/site-control/configSnapshot'
import { readAssetRelease } from '../src/site-control/assetPublisher'
import { assetArchiveKey,assetBytesDigest,assetReference,assetSnapshotJSON,verifyAssetBytes,
  type AssetRelease,type AssetSnapshot } from '../src/site-control/assetSnapshot'
import { applyP1Schema, type RoleSchema } from './p1-schema'
import { applyP1CentralSchema } from './p1-central-schema'
import { p1BaseManifests, P1_ACCOUNT, P1_EMAIL } from './p1-manifests.mjs'
import { workersCiCommit } from './workers-ci-identity.mjs'

const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_BRANCH !== 'feat/site-per-d1' ||
  workersCiCommit() !== commit || process.env.PAYLOAD_P1_BOOTSTRAP !== '1' ||
  JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit !== commit) throw new Error('P1 bootstrap requires the checked Cloudflare release')
const password = process.env.P1_TEST_PASSWORD, secret = process.env.P1_CENTRAL_SECRET
if (!password || password.length < 32 || !secret || secret.length < 32) throw new Error('P1 bootstrap credentials unavailable')
type Manifest = {
  compatibility_date: string; compatibility_flags: string[]
  d1_databases: { binding: string; database_name: string; database_id: string }[]
  r2_buckets: { binding: string; bucket_name: string }[]
  vars: { WORKER_GROUP: string; SITE_ROUTES: string }
}
const { central,site } = p1BaseManifests() as { central: Manifest; site: Manifest }
// The maintenance proxy binds only storage. There is no unauthenticated HTTP
// bootstrap route and no need for the central Worker to exist yet.
const maintenance = { name: 'payload-wnam-p1-maintenance',account_id: P1_ACCOUNT,
  compatibility_date: central.compatibility_date,compatibility_flags: central.compatibility_flags,
  d1_databases: [...central.d1_databases,...site.d1_databases].map(db => ({ ...db,remote: true })),
  r2_buckets: [...central.r2_buckets,...site.r2_buckets].map(bucket => ({ ...bucket,remote: true })),
}
writeFileSync('.cloudflare-ci/p1-maintenance.json',JSON.stringify(maintenance))
const proxy = await getPlatformProxy({ configPath: '.cloudflare-ci/p1-maintenance.json',remoteBindings: true,persist: false })
const env = proxy.env as unknown as { CENTRAL_D1: D1Database; CENTRAL_MEDIA: R2Bucket; MASTER_ASSET_ARCHIVE: R2Bucket;
  SITE_PUBLIC: R2Bucket; SITE_PRIVATE: R2Bucket; [key: `SITE_D1_${string}`]: D1Database }
const receipts = []
let centralPayload: Awaited<ReturnType<typeof getPayload>> | undefined, sitePayload: typeof centralPayload
try {
  for (const [role,binding] of [['central','CENTRAL_D1'],['site-a','SITE_D1_A'],['site-b','SITE_D1_B']] as const) {
    const schema = JSON.parse(readFileSync(`.cloudflare-ci/role-${role}-schema.json`,'utf8')) as RoleSchema
    assert.equal(schema.role,role)
    const operationId = `p1-${role}-schema-v${role === 'central' ? 9 : 1}`
    receipts.push(role === 'central' ? await applyP1CentralSchema(env[binding],schema) : await applyP1Schema(env[binding],schema,operationId))
    if (role === 'central') await migrateCentralRoleState(env[binding])
    else await migrateSiteRoleState(env[binding])
    // Validate that all explicit runtime migrations were represented by the
    // checked schema artifact, including after resuming a partial seed.
    await applyP1Schema(env[binding],schema,operationId)
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
  const deliveryRelease = await commitMasterRelease(env.CENTRAL_D1,{ format: 1,collection: 'authors',recordId: '990001',revision: 1,tenantId: 1,
    sourceUpdatedAt: '2026-09-18T13:00:00.000Z',data: projectMasterData('authors',{ displayName: 'P1 delivery candidate',
      gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' }),relations: {} },'p1-data-delivery-author-v1')
  const configOperationId = `p1-data-delivery-config-${commit.slice(0,12)}`
  const existingConfig = await env.CENTRAL_D1.prepare(`SELECT snapshot_json AS snapshot,digest,operation_id AS operationId,created_at AS createdAt
    FROM central_config_releases WHERE operation_id=?`).bind(configOperationId)
    .first<{ snapshot: string;digest: string;operationId: string;createdAt: string }>()
  let deliveryConfig: ConfigRelease
  if (existingConfig) deliveryConfig = await verifyConfigRelease({ ...JSON.parse(existingConfig.snapshot),digest: existingConfig.digest,
    operationId: existingConfig.operationId,createdAt: existingConfig.createdAt })
  else {
    const revision = 1+(await env.CENTRAL_D1.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM central_config_releases WHERE kind='llm-prompts' AND site_id=''")
      .first<number>('revision') ?? 0)
    deliveryConfig = await commitConfigRelease(env.CENTRAL_D1,{ format: 1,kind: 'llm-prompts',siteId: '',revision,tenantId: 0,
      sourceRecordId: '990003',sourceUpdatedAt: '2026-09-18T14:00:00.000Z',data: projectConfigData('llm-prompts',{
        defaultModel: 'p1/queue-fixture',temperature: 0.25,globalSystemPrompt: `P1 Queue ${commit.slice(0,12)}`,
      }) },configOperationId)
  }
  const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6K0AAAAASUVORK5CYII=','base64'))
  const ensureDeliveryAsset = async (recordId: string,operationId: string,alt: string): Promise<AssetRelease> => {
    let asset: AssetRelease
    const existing = await env.CENTRAL_D1.prepare('SELECT digest FROM central_asset_releases WHERE record_id=? AND revision=1')
      .bind(recordId).first<string>('digest')
    if (existing) asset = await readAssetRelease(env.CENTRAL_D1,{ recordId,revision: 1,digest: existing })
    else {
      const snapshot: AssetSnapshot = { format: 1,recordId,revision: 1,tenantId: 1,
        sourceUpdatedAt: '2026-09-18T14:00:00.000Z',alt,mimeType: 'image/png',size: png.byteLength,
        sha256: await assetBytesDigest(png),width: 1,height: 1 }
      const snapshotJSON = assetSnapshotJSON(snapshot),digest = await masterDigest(snapshotJSON),createdAt = new Date().toISOString()
      asset = { ...snapshot,digest,operationId,createdAt }
      await verifyAssetBytes(asset,png)
      await env.MASTER_ASSET_ARCHIVE.put(assetArchiveKey(asset),png,{ onlyIf: { etagDoesNotMatch: '*' },sha256: asset.sha256,
        httpMetadata: { contentType: asset.mimeType,cacheControl: 'private, no-store' } })
      await env.CENTRAL_D1.prepare(`INSERT INTO central_asset_releases(record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
        VALUES(?,?,?,?,?,?,?)`).bind(asset.recordId,asset.revision,asset.tenantId,asset.digest,snapshotJSON,asset.operationId,asset.createdAt).run()
      asset = await readAssetRelease(env.CENTRAL_D1,assetReference(asset))
    }
    const archived = await env.MASTER_ASSET_ARCHIVE.get(assetArchiveKey(asset))
    assert.ok(archived); await verifyAssetBytes(asset,new Uint8Array(await archived.arrayBuffer()))
    return asset
  }
  const deliveryAsset = await ensureDeliveryAsset(String(900000000+parseInt(commit.slice(0,7),16)%100000000),
    `p1-data-delivery-asset-${commit.slice(0,12)}`,'P1 Queue delivery fixture')
  const recoveryAsset = await ensureDeliveryAsset(String(800000000+parseInt(createHash('sha256').update(commit).digest('hex').slice(0,7),16)%100000000),
    `p1-data-recovery-asset-${commit.slice(0,12)}`,'P1 Queue forward recovery fixture')
  const unavailable = async () => { throw new Error('No external capability during P1 bootstrap') }
  sitePayload = await getPayload({ key: 'p1-sites-bootstrap',disableOnInit: true,config: await createSitePayloadConfig({ secret,
    identity: { authenticate: unavailable,redeem: unavailable,logout: unavailable },
    publicBucket: env.SITE_PUBLIC,privateBucket: env.SITE_PRIVATE,generationModels: OpenAIConfig.models,
    authorizeAiGeneration: async () => false,executeExternalTask: unavailable }) })
  const local = sitePayload
  const routes = JSON.parse(site.vars.SITE_ROUTES) as { siteId: string; localSiteId: number; databaseId: string; bindingName: `SITE_D1_${string}`; schemaVersion: number }[]
  for (const [index,route] of routes.entries()) {
    const tenant = index + 1, adminHost = `cms-site-${route.siteId}.beginos.org`
    const registered = await readSiteRegistration(env.CENTRAL_D1,route.siteId)
    const desired = { ...route,workerGroup: site.vars.WORKER_GROUP,adminHost,routingVersion: 1,
      migrationState: 'active' as const,timezone: 'UTC',productionEnabled: false,operationId: `p1-provision-${route.siteId}-v1` }
    if (registered) {
      for (const key of ['siteId','localSiteId','databaseId','bindingName','workerGroup','adminHost','schemaVersion','timezone','productionEnabled','operationId'] as const) {
        assert.equal(registered[key],desired[key],`P1 registered ${key} conflict`)
      }
      assert.ok(['active','paused'].includes(registered.migrationState),'P1 site is not available for bootstrap')
    } else await registerSite(env.CENTRAL_D1,desired)
    // Preserve legitimate lifecycle versions/state. A deployment retry must not
    // undo a pause or resurrect invalidated site sessions by resetting version 1.
    const routingVersion = registered?.routingVersion ?? 1
    await withSiteContext({ ...route,binding: env[route.bindingName],requestHost: adminHost,routingVersion,currentRoutingVersion: () => routingVersion,identity: null },async () => {
      const found = await local.find({ collection: 'tenants',where: { id: { equals: tenant } },limit: 1,depth: 0 })
      if (found.docs.length) assert.equal(found.docs[0].slug,`p1-tenant-${tenant}`)
      else await local.create({ collection: 'tenants',data: { id: tenant,name: `P1 Tenant ${tenant}`,slug: `p1-tenant-${tenant}`,
        centralSource: { recordId: String(tenant),revision: 1,syncedAt: new Date().toISOString() } } as never })
      await syncSiteIdentityProjection({ siteId: route.siteId,localSiteId: route.localSiteId,userId: '7',displayName: 'P1 Staff',role: 'manager',routingVersion })
      const foundSite = await local.find({ collection: 'sites',where: { id: { equals: route.localSiteId } },limit: 1,depth: 0 })
      if (foundSite.docs.length) assert.equal(foundSite.docs[0].slug,route.siteId)
      else await local.create({ collection: 'sites',data: { id: route.localSiteId,name: `P1 Site ${route.siteId}`,slug: route.siteId,tenant,
        publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
    })
    const found = await payload.find({ collection: 'sites',where: { id: { equals: route.localSiteId } },limit: 1,depth: 0 })
    if (found.docs.length) assert.equal((found.docs[0] as unknown as { runtimeSiteId: string }).runtimeSiteId,route.siteId)
    else await payload.create({ collection: 'sites',user: principal,data: { id: route.localSiteId,name: `P1 Site ${route.siteId}`,tenant,
      runtimeSiteId: route.siteId,primaryDomain: `${route.siteId}.example.invalid`,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
    await env.CENTRAL_D1.prepare(`INSERT INTO site_runtime_access (site_id,user_id,role) VALUES (?,'7','manager')
      ON CONFLICT(site_id,user_id) DO UPDATE SET role='manager'`).bind(route.siteId).run()
  }
  const deliveryOperationId = (kind: string) => {
    const hash = createHash('sha256').update(`p1-data-delivery:${kind}:${commit}`).digest('hex')
    return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`
  }
  const report = { event: 'p1_bootstrap_passed',commit,checkedAt: new Date().toISOString(),schemas: receipts,siteIds: routes.map(route => route.siteId),syntheticUserId: 7,
    deliveries: {
      master: { operationId: deliveryOperationId('master'),reference: masterReference(deliveryRelease) },
      config: { operationId: deliveryOperationId('config'),reference: configReference(deliveryConfig) },
      asset: { operationId: deliveryOperationId('asset'),reference: assetReference(deliveryAsset) },
      withdrawal: { operationId: deliveryOperationId('withdrawal'),reference: assetReference(deliveryAsset) },
      recoveryWithdrawal: { operationId: deliveryOperationId('recovery-withdrawal'),reference: assetReference(recoveryAsset) },
    } }
  writeFileSync('.cloudflare-ci/p1-bootstrap.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally {
  await sitePayload?.destroy(); await centralPayload?.destroy(); await proxy.dispose()
}
process.exit(0)
