// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createDataDelivery, type DataDeliveryAuth, type SiteDataRPC } from '../../src/site-control/dataDelivery'
import { SiteLoginBroker } from '../../src/site-control/sso'
import { payloadSessionAuthority } from '../../src/site-control/payloadSessionAuthority'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { migrateCentralMasters } from '../../src/site-control/masterSchema'
import { migrateCentralConfigs } from '../../src/site-control/configSchema'
import { migrateCentralAssets } from '../../src/site-control/assetSchema'
import { commitMasterRelease } from '../../src/site-control/masterPublisher'
import { commitConfigRelease } from '../../src/site-control/configPublisher'
import { assetArchiveKey, assetBytesDigest, assetReference, assetSnapshotJSON, type AssetRelease } from '../../src/site-control/assetSnapshot'
import { masterDigest, masterReference, projectMasterData, type MasterReference } from '../../src/site-control/masterSnapshot'
import { configReference, projectConfigData, type ConfigReference } from '../../src/site-control/configSnapshot'
import { withSiteContext } from '../../src/site-runtime/context'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>;getR2Bucket: (name: string) => Promise<R2Bucket>;dispose: () => Promise<void> }
let db: D1Database,archive: R2Bucket,service: SiteDataRPC,broker: SiteLoginBroker,auth: DataDeliveryAuth
let master: MasterReference,config: ConfigReference,asset: AssetRelease
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6K0AAAAASUVORK5CYII=','base64'))
const stamp = '2026-09-17T09:00:00.000Z'
async function login(siteId='a',userId='7'): Promise<DataDeliveryAuth> {
  const ticket = await broker.issueTicket(siteId,{ userId,sessionId: `session-${userId}` })
  const adminHost = `cms-site-${siteId}.beginos.org`
  return { session: (await broker.redeemTicket(ticket.ticket,siteId,adminHost)).session,siteId,adminHost,routingVersion: 1 }
}
describe('central data delivery authorizes live sessions and isolates release scope',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',
      d1Databases: { CENTRAL: 'data-delivery-central' },r2Buckets: { ARCHIVE: 'data-delivery-archive' } })
    db = await mf.getD1Database('CENTRAL'); archive = await mf.getR2Bucket('ARCHIVE')
    await db.batch(['CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL,lock_until TEXT)',
      'CREATE TABLE users_sessions(id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)',
      'CREATE TABLE sites(id INTEGER PRIMARY KEY,runtime_site_id TEXT,tenant_id INTEGER)'].map(sql => db.prepare(sql)))
    await migrateSiteControl(db); await migrateCentralMasters(db); await migrateCentralConfigs(db); await migrateCentralAssets(db)
    for (const user of [7,8]) {
      await db.prepare('INSERT INTO users VALUES(?,?,NULL)').bind(user,`user-${user}@example.invalid`).run()
      await db.prepare('INSERT INTO users_sessions VALUES(?,?,?)').bind(`session-${user}`,user,new Date(Date.now()+3600000).toISOString()).run()
    }
    for (const [siteId,id,tenant] of [['a',37,1],['b',82,2]] as const) {
      await registerSite(db,{ siteId,localSiteId: id,databaseId: `${String(id).padStart(8,'0')}-1111-4111-8111-111111111111`,bindingName: `SITE_D1_${siteId.toUpperCase()}`,
        workerGroup: 'test',adminHost: `cms-site-${siteId}.beginos.org`,schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `register-${siteId}` })
      await db.prepare('INSERT INTO sites VALUES(?,?,?)').bind(id,siteId,tenant).run()
      for (const user of [7,8]) await db.prepare('INSERT INTO site_runtime_access VALUES(?,?,?)').bind(siteId,String(user),user===7?'manager':'editor').run()
    }
    master = masterReference(await commitMasterRelease(db,{ format: 1,collection: 'authors',recordId: '100',revision: 1,tenantId: 1,sourceUpdatedAt: stamp,
      data: projectMasterData('authors',{ displayName: 'Tenant one author',gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' }),relations: {} },'author'))
    config = configReference(await commitConfigRelease(db,{ format: 1,kind: 'llm-prompts',siteId: '',revision: 1,tenantId: 0,sourceRecordId: '1',sourceUpdatedAt: stamp,
      data: projectConfigData('llm-prompts',{ globalSystemPrompt: 'Shared instructions',temperature: 0.2,defaultModel: 'fixture' }) },'config'))
    const snapshot = { format: 1 as const,recordId: '200',revision: 1,tenantId: 1,sourceUpdatedAt: stamp,alt: 'Tenant image',mimeType: 'image/png' as const,
      size: png.length,sha256: await assetBytesDigest(png),width: 1,height: 1 }
    const json = assetSnapshotJSON(snapshot)
    asset = { ...snapshot,digest: await masterDigest(json),operationId: 'asset',createdAt: stamp }
    await db.prepare('INSERT INTO central_asset_releases VALUES(?,?,?,?,?,?,?)').bind(asset.recordId,asset.revision,asset.tenantId,asset.digest,json,asset.operationId,stamp).run()
    await archive.put(assetArchiveKey(asset),png)
    broker = new SiteLoginBroker(db,payloadSessionAuthority(db)); service = createDataDelivery(db,archive); auth = await login()
  },30000)
  afterAll(async () => { await mf?.dispose() })

  it('returns only pinned tenant master/assets and global configuration with the authenticated principal',async () => {
    const result = await service.readMaster(auth,master)
    expect(result).toMatchObject({ ok: true,principal: { userId: '7',role: 'manager',siteId: 'a',localSiteId: 37 },value: { root: master,centralTenantId: 1 } })
    expect(await service.readConfig(auth,config)).toMatchObject({ ok: true,value: { release: { digest: config.digest } } })
    expect(await service.readAsset(auth,assetReference(asset))).toMatchObject({ ok: true,value: { bytes: png,withdrawal: null } })
    expect(JSON.stringify(result)).not.toContain(auth.session)
    const other = await login('b')
    expect(await service.readMaster(other,master)).toEqual({ ok: false,reason: 'unavailable' })
    expect(await service.readAsset(other,assetReference(asset))).toEqual({ ok: false,reason: 'unavailable' })
    expect(await service.readConfig(other,config)).toMatchObject({ ok: true,value: { siteId: 'b',localSiteId: 82,centralTenantId: 2 } })
  })
  it('rejects editor sessions, forged site/host/version, malformed references and unauthenticated requests',async () => {
    expect(await service.readMaster(await login('a','8'),master)).toEqual({ ok: false,reason: 'denied' })
    for (const invalid of [{ ...auth,session: '0'.repeat(64) },{ ...auth,siteId: 'b',adminHost: 'cms-site-b.beginos.org' },{ ...auth,routingVersion: 2 }]) {
      expect(await service.readMaster(invalid,master)).toEqual({ ok: false,reason: 'denied' })
    }
    expect((await service.readMaster({ ...auth,adminHost: 'attacker.example' },master)).ok).toBe(false)
    expect(await service.readMaster(auth,{ ...master,recordId: "1' OR 1=1" })).toEqual({ ok: false,reason: 'denied' })
    expect(await service.readConfig(auth,{ ...config,siteId: 'a' })).toEqual({ ok: false,reason: 'denied' })
  })
  it('revalidates manager grant after asynchronous archive reads instead of releasing bytes after revocation',async () => {
    const delayed = new Proxy(archive,{ get(target,key) {
      if (key === 'get') return async (...args: Parameters<R2Bucket['get']>) => {
        const value = await target.get(...args)
        await db.prepare("UPDATE site_runtime_access SET role='viewer' WHERE site_id='a' AND user_id='7'").run()
        return value
      }
      const value = Reflect.get(target,key,target); return typeof value === 'function' ? value.bind(target) : value
    } })
    try {
      expect(await createDataDelivery(db,delayed).readAsset(auth,assetReference(asset))).toEqual({ ok: false,reason: 'denied' })
      expect(await service.readConfig(auth,config)).toEqual({ ok: false,reason: 'denied' })
    } finally { await db.prepare("UPDATE site_runtime_access SET role='manager' WHERE site_id='a' AND user_id='7'").run() }
  })
  it('returns withdrawal metadata without bytes, and fails closed during archive outage without leaking infrastructure details',async () => {
    const unavailable = new Proxy(archive,{ get(target,key) {
      if (key === 'get') return async () => { throw new Error('PRIVATE DATABASE AND TOKEN DETAILS') }
      const value = Reflect.get(target,key,target); return typeof value === 'function' ? value.bind(target) : value
    } })
    expect(await createDataDelivery(db,unavailable).readAsset(auth,assetReference(asset))).toEqual({ ok: false,reason: 'unavailable' })
    await db.prepare('INSERT INTO central_asset_withdrawals VALUES(?,?,?,?,?,?)').bind(asset.recordId,asset.revision,asset.digest,'withdraw',stamp,'Withdrawn by publisher').run()
    expect(await createDataDelivery(db,unavailable).readAsset(auth,assetReference(asset))).toMatchObject({ ok: true,value: { bytes: null,withdrawal: { reason: 'Withdrawn by publisher' } } })
  })
  it('rejects central capabilities in a site context and immediately reflects logout, account lock and paused routing',async () => {
    const result = await withSiteContext({ siteId: 'a',localSiteId: 37,binding: db,routingVersion: 1,currentRoutingVersion: () => 1,identity: null },() => service.readMaster(auth,master))
    expect(result).toEqual({ ok: false,reason: 'unavailable' })
    const disposable = await login(); await broker.revokeSession(disposable.session)
    expect(await service.readMaster(disposable,master)).toEqual({ ok: false,reason: 'denied' })
    try {
      await db.prepare('UPDATE users SET lock_until=? WHERE id=7').bind(new Date(Date.now()+3600000).toISOString()).run()
      expect(await service.readMaster(auth,master)).toEqual({ ok: false,reason: 'denied' })
    } finally { await db.prepare('UPDATE users SET lock_until=NULL WHERE id=7').run() }
    try {
      await db.prepare("UPDATE site_runtime_registry SET migration_state='paused' WHERE site_id='a'").run()
      expect(await service.readMaster(auth,master)).toEqual({ ok: false,reason: 'denied' })
    } finally { await db.prepare("UPDATE site_runtime_registry SET migration_state='active' WHERE site_id='a'").run() }
    await db.prepare("DELETE FROM users_sessions WHERE id='session-7'").run()
    expect(await service.readConfig(auth,config)).toEqual({ ok: false,reason: 'denied' })
  })
})
