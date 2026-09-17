// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { createCentralPayloadConfig } from '../../src/site-control/config'
import { createSitePayloadConfig } from '../../src/site-runtime/config'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { migrateCentralMasters, migrateSiteMasters } from '../../src/site-control/masterSchema'
import { migrateCentralConfigs, migrateSiteConfigs } from '../../src/site-control/configSchema'
import { migrateCentralAssets, migrateSiteAssets } from '../../src/site-control/assetSchema'
import { migrateSiteMasterCopies } from '../../src/site-runtime/masterCopySchema'
import { exportAssetTransfer, publishAssetFromPayload, withdrawAssetFromPayload } from '../../src/site-control/assetPublisher'
import { assetArchiveKey, assetFilename, assetReference, type AssetRelease, type AssetTransfer } from '../../src/site-control/assetSnapshot'
import { copyAssetToSite, requireAssetCopy, synchronizeAssetWithdrawal, type SiteAssetBuckets } from '../../src/site-runtime/assetCopies'
import { exportMasterBundle, publishMasterFromPayload } from '../../src/site-control/masterPublisher'
import { masterReference } from '../../src/site-control/masterSnapshot'
import { receiveMasterRelease } from '../../src/site-runtime/masterReceiver'
import { applyMasterRelease } from '../../src/site-runtime/masterCopies'
import { exportConfigBundle, publishConfigFromPayload } from '../../src/site-control/configPublisher'
import { configReference } from '../../src/site-control/configSnapshot'
import { receiveConfigRelease } from '../../src/site-runtime/configReceiver'
import { reviewSiteConfig, selectSiteConfig } from '../../src/site-runtime/configSelection'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { createSiteR2Proxy } from '../../src/site-runtime/r2'

vi.mock('../../src/payload.config',() => { throw new Error('Shared Payload config imported') })
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const { Headers: MiniflareHeaders } = createRequire(require.resolve('miniflare'))('undici')
let mf: { getD1Database: (name: string) => Promise<D1Database>;getR2Bucket: (name: string) => Promise<R2Bucket>;dispose: () => Promise<void> }
let central: Payload,site: Payload,db: D1Database,contexts: SiteContext[],source: R2Bucket,archive: R2Bucket,storage: SiteAssetBuckets
let admin: NonNullable<PayloadRequest['user']>
const external = vi.fn(async () => { throw new Error('External capability unexpectedly invoked') })
const stamp = '2026-09-17T07:00:00.000Z'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6K0AAAAASUVORK5CYII=','base64')
async function schema(payload: Payload,db: D1Database) {
  const adapter = payload.db as unknown as { schema: unknown;defaultDrizzleSnapshot: unknown;requireDrizzleKit: () => {
    generateDrizzleJson: (schema: unknown) => unknown;generateMigration: (before: unknown,after: unknown) => Promise<string[]> } }
  const kit = adapter.requireDrizzleKit(),sql = await kit.generateMigration(adapter.defaultDrizzleSnapshot,await kit.generateDrizzleJson(adapter.schema))
  for (let offset=0;offset<sql.length;offset+=25) await db.batch(sql.slice(offset,offset+25).map(sql => db.prepare(sql)))
}
const request = (role='manager',siteId='a') => createLocalReq({ user: { id: 1,centralUserId: '7',displayName: 'Manager',collection: 'users',
  _strategy: 'central-site-session',siteId,siteRole: role } as never },site)
const centralRequest = () => createLocalReq({ user: admin },central)
const capability = (transfer: AssetTransfer) => ({ readAsset: async () => transfer })
async function media(id: number,assetClass='decorative') {
  return central.create({ collection: 'media',user: admin,data: { id,alt: 'Source image',tenant: 1,assetClass } as never,
    file: { name: `asset-${id}.png`,mimetype: 'image/png',size: png.length,data: png } })
}
async function publish(id: number,global=false) {
  const doc = await media(id)
  return publishAssetFromPayload(db,source,archive,await centralRequest(),{
    recordId: String(id),expectedRevision: 0,expectedUpdatedAt: doc.updatedAt,global,operationId: `publish-${id}` })
}
const transfer = (release: AssetRelease,siteId='a') => exportAssetTransfer(db,archive,siteId,1,assetReference(release))
async function file(release: AssetRelease) {
  const endpoints = site.collections.media.config.endpoints
  if (!Array.isArray(endpoints)) throw new Error('Upload file endpoint missing')
  const handler = endpoints.find(endpoint => endpoint.path === '/file/:filename')!.handler
  return handler(await createLocalReq({ req: { routeParams: { collection: 'media',filename: assetFilename(release) },headers: new Headers() } },site))
}
function failingPut(bucket: R2Bucket): R2Bucket {
  return new Proxy(bucket,{ get(target,key) {
    if (key === 'put') return async () => { throw new Error('injected R2 failure') }
    const value = Reflect.get(target,key,target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

describe('versioned media across actual central/site Payload, native D1 and R2',() => {
  beforeAll(async () => {
    // This pinned Miniflare bridge requires its own undici Headers instance in
    // writeHttpMetadata. Keep Payload's production handler path enabled; the
    // workerd fixture separately exercises genuine native Headers and R2.
    vi.stubGlobal('Headers',MiniflareHeaders)
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',
      d1Databases: { CENTRAL: 'asset-central',A: 'asset-a',B: 'asset-b' },r2Buckets: { SOURCE: 'asset-source',ARCHIVE: 'asset-archive',PUBLIC: 'asset-public',PRIVATE: 'asset-private' } })
    db = await mf.getD1Database('CENTRAL'); source = await mf.getR2Bucket('SOURCE'); archive = await mf.getR2Bucket('ARCHIVE')
    storage = { publicBucket: await mf.getR2Bucket('PUBLIC'),privateBucket: await mf.getR2Bucket('PRIVATE') }
    central = await getPayload({ key: 'asset-sync-central',config: await createCentralPayloadConfig({ database: db,bucket: source,
      secret: 'isolated-asset-central',generationModels: [],authorizeAiGeneration: external }) })
    site = await getPayload({ key: 'asset-sync-site',config: await createSitePayloadConfig({ secret: 'isolated-asset-site',identity: { authenticate: external,redeem: external,logout: external },
      ...storage,generationModels: [],authorizeAiGeneration: external,executeExternalTask: external }) })
    await schema(central,db); await migrateSiteControl(db); await migrateCentralMasters(db); await migrateCentralConfigs(db)
    await migrateCentralAssets(db); await migrateCentralAssets(db)
    const bootstrap = { id: 7,collection: 'users',email: 'admin@example.invalid',roles: ['super-admin'] } as typeof admin
    for (const id of [1,2]) await central.create({ collection: 'tenants',data: { id,name: `Tenant ${id}`,slug: `tenant-${id}`,domain: `tenant-${id}.example.invalid` } })
    admin = { ...await central.create({ collection: 'users',user: bootstrap,data: { id: 7,email: 'admin@example.invalid',password: 'asset-test-only-password',
      roles: ['super-admin'],tenants: [{ tenant: 1 },{ tenant: 2 }] } }),collection: 'users' }
    contexts = []
    for (const [name,centralId,localSiteId,localTenantId,centralTenant] of [['A',137,37,11,1],['B',182,82,22,2]] as const) {
      const binding = await mf.getD1Database(name),siteId = name.toLowerCase()
      await schema(site,binding); await migrateSiteMasters(binding); await migrateSiteMasterCopies(binding); await migrateSiteConfigs(binding)
      await migrateSiteAssets(binding); await migrateSiteAssets(binding)
      await registerSite(db,{ siteId,localSiteId,databaseId: `${centralId.toString().padStart(8,'0')}-1111-4111-8111-111111111111`,bindingName: `SITE_D1_${name}`,
        workerGroup: 'group-1',adminHost: `cms-site-${siteId}.beginos.org`,schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `register-${siteId}` })
      await central.create({ collection: 'sites',user: admin,data: { id: centralId,name: siteId,tenant: centralTenant,runtimeSiteId: siteId,primaryDomain: `${siteId}.example.invalid`,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
      const context: SiteContext = { siteId,localSiteId,binding,routingVersion: 1,currentRoutingVersion: () => 1,identity: null,requestHost: `cms-site-${siteId}.beginos.org` }
      contexts.push(context)
      await withSiteContext(context,async () => {
        await syncSiteIdentityProjection({ siteId,localSiteId,userId: '7',displayName: 'Manager',role: 'manager',routingVersion: 1 })
        await site.create({ collection: 'tenants',data: { id: localTenantId,name: 'Tenant',slug: 'tenant',centralSource: { recordId: String(centralTenant),revision: 1,syncedAt: stamp } } as never })
        await site.create({ collection: 'sites',data: { id: localSiteId,name: siteId,slug: siteId,tenant: localTenantId,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
      })
    }
  },120000)
  afterAll(async () => { try { await mf?.dispose() } finally { vi.unstubAllGlobals() } })

  it('copies immutable bytes once under concurrent retries and remaps a real author headshot to a local media ID',async () => {
    const asset = await publish(5001),ref = assetReference(asset),delivery = await transfer(asset)
    expect(await source.get(assetArchiveKey(asset))).toBeNull()
    expect(new Uint8Array(await (await archive.get(assetArchiveKey(asset)))!.arrayBuffer())).toEqual(new Uint8Array(png))
    const author = await central.create({ collection: 'authors',user: admin,data: { displayName: 'Author with portrait',slug: 'portrait-author',tenant: 1,
      headshot: 5001,gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' } as never })
    const released = await publishMasterFromPayload(db,await centralRequest(),{ collection: 'authors',recordId: String(author.id),expectedRevision: 0,
      expectedUpdatedAt: author.updatedAt,relations: {},assets: { headshot: ref },operationId: 'author-with-headshot' })
    const bundle = await exportMasterBundle(db,'a',1,masterReference(released))
    await withSiteContext(contexts[0],async () => {
      const req = await request()
      await receiveMasterRelease(masterReference(released),{ readBundle: async () => bundle })
      await expect(applyMasterRelease(req,masterReference(released),'author-before-asset')).rejects.toThrow('asset copy')
      const ids = await Promise.all(Array.from({ length: 5 },() => copyAssetToSite(req,ref,'copy-5001',capability(delivery),storage)))
      expect(new Set(ids).size).toBe(1); expect(ids[0]).not.toBe(5001)
      const copy = await applyMasterRelease(req,masterReference(released),'apply-author-asset')
      expect((await site.findByID({ collection: 'authors',id: copy.localId,depth: 0 })).headshot).toBe(ids[0])
      expect(await site.findByID({ collection: 'media',id: ids[0],depth: 0 })).toMatchObject({ alt: 'Source image',site: 37,tenant: 11,filename: assetFilename(asset) })
      const storedObject = await createSiteR2Proxy(storage.publicBucket).get(assetArchiveKey(asset))
      expect(storedObject).not.toBeNull()
      const storedHeaders = new Headers()
      storedObject!.writeHttpMetadata(storedHeaders)
      expect(storedHeaders.get('cache-control')).toBe('public, max-age=300')
      const response = await file(asset)
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('max-age=300')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(png))
      await expect(site.update({ collection: 'media',id: ids[0],req,overrideAccess: false,data: { alt: 'overwrite' } })).rejects.toThrow('immutable')
      await expect(site.delete({ collection: 'media',id: ids[0],req,overrideAccess: false })).rejects.toThrow('retired')
      await expect(createSiteR2Proxy(storage.publicBucket).put(assetArchiveKey(asset),png)).rejects.toThrow('synchronization')
      await expect(createSiteR2Proxy(storage.publicBucket).delete(assetArchiveKey(asset))).rejects.toThrow('synchronization')
    })
    await expect(transfer(asset,'b')).rejects.toThrow('Cross-tenant')
  },45000)

  it('applies a global branding logo independently to two sites only after asset copy and explicit review',async () => {
    const asset = await publish(5002,true),ref = assetReference(asset)
    const branding = await central.updateGlobal({ slug: 'admin-branding',user: admin,data: { brandName: 'Shared brand',logo: 5002,primaryColor: '#112233',supportEmail: 'help@example.invalid' } })
    const release = await publishConfigFromPayload(db,await centralRequest(),{ kind: 'admin-branding',sourceRecordId: String(branding.id),expectedRevision: 0,
      expectedUpdatedAt: branding.updatedAt!,assets: { logo: ref },operationId: 'branding-v1' })
    for (const context of contexts) {
      const delivery = await transfer(asset,context.siteId),bundle = await exportConfigBundle(db,context.siteId,1,configReference(release))
      await withSiteContext(context,async () => {
        const req = await request('manager',context.siteId)
        await receiveConfigRelease(configReference(release),{ readConfig: async () => bundle })
        const review = await reviewSiteConfig(req,'admin-branding')
        await expect(selectSiteConfig(req,configReference(release),review.expected,'brand-before-copy')).rejects.toThrow('asset copy')
        const id = await copyAssetToSite(req,ref,'brand-copy',capability(delivery),storage)
        await selectSiteConfig(req,configReference(release),review.expected,'brand-select')
        expect(await site.findGlobal({ slug: 'admin-branding',req,depth: 0 })).toMatchObject({ brandName: 'Shared brand',logo: id })
        expect(await storage.publicBucket.head(`sites/${context.siteId}/${assetArchiveKey(asset)}`)).not.toBeNull()
      })
    }
    expect(external).not.toHaveBeenCalled()
  },45000)

  it('resumes a durable publication after R2 and D1 failures without changing pinned metadata',async () => {
    const doc = await media(5003),req = await centralRequest(),input = {
      recordId: '5003',expectedRevision: 0,expectedUpdatedAt: doc.updatedAt,global: false,operationId: 'publication-retry' }
    await expect(publishAssetFromPayload(db,source,failingPut(archive),req,input)).rejects.toThrow('injected R2')
    await db.exec("CREATE TRIGGER fail_asset_release BEFORE INSERT ON central_asset_releases WHEN NEW.record_id='5003' BEGIN SELECT RAISE(ABORT,'injected publication failure'); END")
    await expect(publishAssetFromPayload(db,source,archive,req,input)).rejects.toThrow('injected publication')
    await central.update({ collection: 'media',id: 5003,user: admin,data: { alt: 'Later metadata' } })
    await db.exec('DROP TRIGGER fail_asset_release')
    const release = await publishAssetFromPayload(db,source,archive,req,input)
    expect(release.alt).toBe('Source image')
    expect(await publishAssetFromPayload(db,source,archive,req,input)).toEqual(release)
    await expect(publishAssetFromPayload(db,source,archive,req,{ ...input,global: true })).rejects.toThrow('conflict')
  },30000)

  it('retries partial R2 copy and atomically rolls back failed media insertion without duplicate local IDs',async () => {
    const asset = await publish(5004),ref = assetReference(asset),cap = capability(await transfer(asset))
    await withSiteContext(contexts[0],async () => {
      const req = await request(),binding = contexts[0].binding
      await expect(copyAssetToSite(req,ref,'site-copy-retry',cap,{ ...storage,publicBucket: failingPut(storage.publicBucket) })).rejects.toThrow('injected R2')
      expect(await storage.privateBucket.head(`sites/a/${assetArchiveKey(asset)}`)).not.toBeNull()
      await binding.exec("CREATE TRIGGER fail_asset_media BEFORE INSERT ON media WHEN NEW.central_source_record_id='5004' BEGIN SELECT RAISE(ABORT,'injected media failure'); END")
      await expect(copyAssetToSite(req,ref,'site-copy-retry',cap,storage)).rejects.toThrow('injected media')
      expect(await binding.prepare("SELECT committed FROM site_asset_operations WHERE operation_id='site-copy-retry'").first('committed')).toBe(0)
      expect(await binding.prepare("SELECT COUNT(*) AS n FROM site_asset_copies WHERE record_id='5004'").first('n')).toBe(0)
      await binding.exec('DROP TRIGGER fail_asset_media')
      const id = await copyAssetToSite(req,ref,'site-copy-retry',cap,storage)
      expect(await copyAssetToSite(req,ref,'site-copy-retry',cap,storage)).toBe(id)
      expect(await binding.prepare("SELECT COUNT(*) AS n FROM media WHERE central_source_record_id='5004'").first('n')).toBe(1)
    })
  },30000)

  it('rejects editor actions, forged destinations, corrupted bytes and private evidence publication',async () => {
    const asset = await publish(5005),ref = assetReference(asset),delivery = await transfer(asset)
    await withSiteContext(contexts[0],async () => {
      await expect(copyAssetToSite(await request('editor'),ref,'editor',capability(delivery),storage)).rejects.toThrow('manager')
      await expect(copyAssetToSite(await request(),ref,'forged',capability({ ...delivery,siteId: 'b' }),storage)).rejects.toThrow('destination')
      await expect(copyAssetToSite(await request(),ref,'bad-bytes',capability({ ...delivery,bytes: new Uint8Array(png.length) }),storage)).rejects.toThrow('bytes')
      expect(await contexts[0].binding.prepare("SELECT COUNT(*) AS n FROM site_asset_copies WHERE record_id='5005'").first('n')).toBe(0)
    })
    const evidence = await media(5006,'evidence')
    await expect(publishAssetFromPayload(db,source,archive,await centralRequest(),{ recordId: '5006',expectedRevision: 0,
      expectedUpdatedAt: evidence.updatedAt,global: false,operationId: 'evidence-denied' })).rejects.toThrow('evidence')
  },30000)

  it('retries withdrawals, keeps relationship identity and makes the actual file endpoint return 404',async () => {
    const asset = await publish(5007),ref = assetReference(asset),stale = capability(await transfer(asset))
    let id = 0
    await withSiteContext(contexts[0],async () => { id = await copyAssetToSite(await request(),ref,'before-withdraw',stale,storage) })
    await withdrawAssetFromPayload(db,await centralRequest(),ref,'withdraw-5007','Source withdrawn')
    const delivery = await transfer(asset); expect(delivery.bytes).toBeNull()
    await withSiteContext(contexts[0],async () => {
      const req = await request(),cap = capability(delivery)
      await expect(synchronizeAssetWithdrawal(req,ref,'withdraw-site-5007',cap,{ ...storage,publicBucket: failingPut(storage.publicBucket) })).rejects.toThrow('injected R2')
      expect(await contexts[0].binding.prepare("SELECT committed FROM site_asset_operations WHERE operation_id='withdraw-site-5007'").first('committed')).toBe(0)
      await expect(requireAssetCopy(req,ref)).rejects.toThrow('withdrawn')
      await synchronizeAssetWithdrawal(req,ref,'withdraw-site-5007',cap,storage)
      await synchronizeAssetWithdrawal(req,ref,'withdraw-site-5007',cap,storage)
      expect((await site.findByID({ collection: 'media',id,depth: 0 })).id).toBe(id)
      expect((await file(asset)).status).toBe(404)
      await expect(copyAssetToSite(req,ref,'stale-copy',stale,storage)).rejects.toThrow('withdrawn')
      expect((await storage.publicBucket.head(`sites/a/${assetArchiveKey(asset)}`))!.size).toBe(0)
    })
  },30000)

  it('prevents an in-flight copy from resurrecting bytes after concurrent withdrawal',async () => {
    const asset = await publish(5008),ref = assetReference(asset),stale = capability(await transfer(asset))
    await withdrawAssetFromPayload(db,await centralRequest(),ref,'withdraw-5008','Concurrent withdrawal')
    const withdrawn = capability(await transfer(asset))
    await withSiteContext(contexts[0],async () => {
      const req = await request(); let intercepted = false
      const bucket = new Proxy(storage.publicBucket,{ get(target,key) {
        if (key === 'put') return async (...args: Parameters<R2Bucket['put']>) => {
          if (!intercepted) { intercepted = true; await synchronizeAssetWithdrawal(req,ref,'racing-withdrawal',withdrawn,storage) }
          return target.put(...args)
        }
        const value = Reflect.get(target,key,target); return typeof value === 'function' ? value.bind(target) : value
      } })
      await expect(copyAssetToSite(req,ref,'racing-copy',stale,{ ...storage,publicBucket: bucket })).rejects.toThrow('withdrawn')
      expect(await storage.publicBucket.head(`sites/a/${assetArchiveKey(asset)}`)).toMatchObject({ size: 0,customMetadata: { assetWithdrawn: '1' } })
      expect(await contexts[0].binding.prepare("SELECT COUNT(*) AS n FROM site_asset_copies WHERE record_id='5008'").first('n')).toBe(0)
    })
  },30000)
})
