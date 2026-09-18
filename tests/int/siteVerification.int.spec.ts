// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync,realpathSync } from 'node:fs'
import { afterEach,beforeEach,describe,expect,it } from 'vitest'
import { roleSchemaDigest,type RoleSchema } from '../../scripts/p1-schema'
import { verifySiteDatabase } from '../../scripts/site-operations/verify-database'
import { inspectSiteRuntime } from '../../src/site-runtime/runtimeInspection'
import type { SiteEnvironment } from '../../src/application-roles/siteEnvironment'
import type { SiteRegistration } from '../../src/site-control/registry'
import { registerSite } from '../../src/site-control/registry'
import { siteControlSchema } from '../../src/site-control/schema'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { verifyGroupRuntime } from '../../scripts/site-operations/verify-group-runtime'
import type { GroupManifest } from '../../scripts/site-operations/manifest'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const accountId = 'd487cf34c606620b442632a72272014d',commit = 'a'.repeat(40)
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let db: D1Database,publicBucket: R2Bucket,privateBucket: R2Bucket,site: SiteRegistration,schema: RoleSchema,digest: string
const options = () => ({ database: db,site,schema,schemaDigest: digest,accountId,ownership: { kind: 'provision' as const,operationId: site.operationId },publicBucket,privateBucket })
describe('read-only site verification with native D1 and R2',() => {
  beforeEach(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',d1Databases: ['SITE','CENTRAL'],r2Buckets: ['PUBLIC','PRIVATE'] })
    db = await mf.getD1Database('SITE'); publicBucket = await mf.getR2Bucket('PUBLIC'); privateBucket = await mf.getR2Bucket('PRIVATE')
    site = { siteId: 'historical',localSiteId: 103,databaseId: randomUUID(),bindingName: 'SITE_D1_C',workerGroup: 'group-1',adminHost: 'cms-site-historical.beginos.org',
      schemaVersion: 1,routingVersion: 9,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: randomUUID() }
    await db.batch([
      db.prepare('CREATE TABLE tenants(id INTEGER PRIMARY KEY,central_source_record_id TEXT)'),
      db.prepare('CREATE TABLE sites(id INTEGER PRIMARY KEY,slug TEXT,tenant_id INTEGER REFERENCES tenants(id))'),
      db.prepare('CREATE TABLE users(id INTEGER PRIMARY KEY,central_user_id TEXT)'),
      db.prepare('CREATE TABLE categories(id INTEGER PRIMARY KEY,site_id INTEGER,name TEXT,parent_id INTEGER REFERENCES categories(id))'),
      db.prepare('CREATE TABLE media(id INTEGER PRIMARY KEY,site_id INTEGER,filename TEXT,prefix TEXT,filesize INTEGER,central_source_record_id TEXT,central_source_revision INTEGER)'),
      db.prepare('CREATE TABLE private_media(id INTEGER PRIMARY KEY,site_id INTEGER,filename TEXT,filesize INTEGER)'),
      db.prepare('CREATE TABLE payload_jobs(id INTEGER PRIMARY KEY,input TEXT)'),
      db.prepare('CREATE TABLE site_asset_withdrawals(record_id TEXT,revision INTEGER)'),
    ])
    schema = { role: 'site-a',objects: (await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name").all<RoleSchema['objects'][number]>()).results }
    digest = roleSchemaDigest(schema.objects)
    await db.batch([
      db.prepare('CREATE TABLE site_schema_bootstrap(id INTEGER PRIMARY KEY,operation_id TEXT,site_id TEXT,account_id TEXT,database_id TEXT,digest TEXT,schema_version INTEGER,completed INTEGER)'),
      db.prepare('INSERT INTO site_schema_bootstrap VALUES(1,?,?,?,?,?,1,1)').bind(site.operationId,site.siteId,accountId,site.databaseId,digest),
      db.prepare("INSERT INTO tenants VALUES(1,'5')"),db.prepare("INSERT INTO sites VALUES(103,'historical',1)"),
      db.prepare("INSERT INTO users VALUES(1,'7'),(2,'8')"),db.prepare("INSERT INTO categories VALUES(1,103,'Original',NULL),(2,103,'Child',1)"),
      db.prepare("INSERT INTO media VALUES(1,103,'public.txt',NULL,3,NULL,NULL)"),db.prepare("INSERT INTO private_media VALUES(1,103,'private.txt',3)"),
      db.prepare('INSERT INTO payload_jobs VALUES(1,?)').bind(JSON.stringify({ siteId: 'historical',localSiteId: 103 })),
    ])
    await publicBucket.put('sites/historical/public.txt','pub'); await privateBucket.put('sites/historical/private.txt','pri')
  })
  afterEach(async () => { await mf?.dispose() })
  it('reads every table, checks relationships and both media scopes without any database mutation',async () => {
    const readOnly = new Proxy(db,{ get(target,key) {
      if (key === 'prepare') return (sql: string) => { expect(sql).toMatch(/^(SELECT|PRAGMA (table_info|foreign_key_check))/); return target.prepare(sql) }
      if (key === 'batch' || key === 'exec') return () => { throw new Error('Verification attempted a write capability') }
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value
    } })
    const report = await verifySiteDatabase({ ...options(),database: readOnly })
    expect(report.tables).toHaveLength(8); expect(report.media).toMatchObject({ objects: 2,pendingMedia: 0,withdrawnMedia: 0 })
    expect(report.tasks).toEqual([expect.objectContaining({ table: 'payload_jobs',rows: 1 })])
    expect(await verifySiteDatabase({ ...options(),database: readOnly })).toEqual(report)
    expect(JSON.stringify(report)).not.toContain('Original')
  })
  it('changes the content digest when an existing record changes while preserving row counts',async () => {
    const before = await verifySiteDatabase(options())
    await db.prepare("UPDATE categories SET name='Edited' WHERE id=1").run()
    const after = await verifySiteDatabase(options())
    expect(after.contentDigest).not.toBe(before.contentDigest)
    expect(after.tables.map(row => row.rows)).toEqual(before.tables.map(row => row.rows))
  })
  it('rejects cross-site rows and nested task targets',async () => {
    await db.prepare('UPDATE categories SET site_id=999 WHERE id=1').run()
    await expect(verifySiteDatabase(options())).rejects.toThrow('Cross-site row')
    await db.prepare('UPDATE categories SET site_id=103 WHERE id=1').run()
    await db.prepare('UPDATE payload_jobs SET input=?').bind(JSON.stringify({ args: { siteId: 'another-site' } })).run()
    await expect(verifySiteDatabase(options())).rejects.toThrow('Task references another')
  })
  it('rejects missing private objects and unsafe paths without reading another site prefix',async () => {
    await privateBucket.delete('sites/historical/private.txt')
    await expect(verifySiteDatabase(options())).rejects.toThrow('Missing media object in private_media')
    await privateBucket.put('sites/historical/private.txt','pri')
    await db.prepare("UPDATE media SET prefix='../foreign'").run()
    await expect(verifySiteDatabase(options())).rejects.toThrow('Unsafe media object path')
  })
  it('rejects database changes during media reads instead of certifying a mixed inventory',async () => {
    const bucket = new Proxy(publicBucket,{ get(target,key) {
      if (key === 'get') return async (name: string) => { await db.prepare("UPDATE categories SET name='Concurrent' WHERE id=1").run(); return target.get(name) }
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(verifySiteDatabase({ ...options(),publicBucket: bucket })).rejects.toThrow('data changed during verification')
  })
  it('rejects schema drift and another operation claiming this database',async () => {
    await expect(verifySiteDatabase({ ...options(),ownership: { kind: 'provision',operationId: randomUUID() } })).rejects.toThrow('receipt mismatch')
    await db.prepare('CREATE INDEX unreviewed_index ON categories(name)').run()
    await expect(verifySiteDatabase(options())).rejects.toThrow('schema object count mismatch')
  })
  it('proves an older site binding after a different site was provisioned, including multiple users and paused state',async () => {
    const unavailable = async () => { throw new Error('Unexpected external capability') }
    const env = { PAYLOAD_SECRET: 'x'.repeat(32),CENTRAL_ORIGIN: 'https://p1-hub.beginos.org',WORKER_GROUP: site.workerGroup,
      SITE_ROUTES: JSON.stringify([{ siteId: site.siteId,localSiteId: site.localSiteId,databaseId: site.databaseId,bindingName: site.bindingName,schemaVersion: 1 }]),
      SITE_D1_C: db,SITE_PUBLIC: publicBucket,SITE_PRIVATE: privateBucket,PROVISION_OPERATION: randomUUID(),PROVISION_COMMIT: commit,RELEASE_OPERATION: 'b'.repeat(64),
      ROUTING: { resolve: async () => ({ ...site,migrationState: 'paused' }) },IDENTITY: { authenticate: unavailable,redeem: unavailable,logout: unavailable },
      DATA: { readMaster: unavailable,readConfig: unavailable,readAsset: unavailable } } as unknown as SiteEnvironment
    expect(await inspectSiteRuntime(env,site.siteId)).toMatchObject({ databaseId: site.databaseId,tenantId: 1,state: 'paused',releaseCommit: commit })
    await expect(inspectSiteRuntime(env,'foreign')).rejects.toThrow('not bound')
    const central = await mf.getD1Database('CENTRAL')
    await central.prepare(siteControlSchema[0]).run()
    await registerSite(central,{ ...site,migrationState: 'paused' })
    const manifest = JSON.parse(readFileSync('operations/provision/p1-c.json','utf8')).baseline as GroupManifest
    manifest.vars.WORKER_GROUP = site.workerGroup; manifest.vars.SITE_ROUTES = env.SITE_ROUTES
    manifest.d1_databases = [{ binding: site.bindingName,database_id: site.databaseId,database_name: 'fixture-site' }]
    manifest.routes = [{ pattern: site.adminHost,custom_domain: true }]
    const receipt = { deploymentId: randomUUID(),versionId: randomUUID(),commit,releaseId: 'b'.repeat(64),manifestDigest: provisionDigest(JSON.stringify(manifest)) }
    const readonly = new Proxy(central,{ get(target,key) {
      if (key === 'prepare') return (sql: string) => { expect(sql.trim().startsWith('SELECT')).toBe(true); return target.prepare(sql) }
      throw new Error('Group verification attempted a write capability')
    } })
    expect(await verifyGroupRuntime(manifest,receipt,readonly,id => inspectSiteRuntime(env,id))).toEqual([expect.objectContaining({ state: 'paused',releaseId: receipt.releaseId })])
    // A just-provisioned group has provenance but no ordinary release ID yet.
    const provisionOnly = { ...env,RELEASE_OPERATION: undefined }
    expect(await verifyGroupRuntime(manifest,{ ...receipt,releaseId: null },readonly,id => inspectSiteRuntime(provisionOnly,id)))
      .toEqual([expect.objectContaining({ state: 'paused',releaseId: null })])
    await expect(verifyGroupRuntime(manifest,receipt,readonly,id => inspectSiteRuntime(provisionOnly,id))).rejects.toThrow('runtime proof mismatch')
    await expect(verifyGroupRuntime(manifest,{ ...receipt,commit: 'c'.repeat(40) },readonly,id => inspectSiteRuntime(env,id))).rejects.toThrow('runtime proof mismatch')
    await expect(verifyGroupRuntime(manifest,receipt,readonly,async id => {
      const proof = await inspectSiteRuntime(env,id)
      await central.prepare('UPDATE site_runtime_registry SET routing_version=routing_version+1 WHERE site_id=?').bind(id).run()
      return proof
    })).rejects.toThrow('changed during verification')
    console.log(JSON.stringify({ event: 'ordinary_group_runtime_verified',multipleIdentityProjections: 2,paused: true,readOnly: true,staleReleaseRejected: true,concurrentRouteChangeRejected: true,remoteDeployment: false }))
    let calls = 0
    env.ROUTING.resolve = async () => ({ ...site,routingVersion: ++calls === 1 ? 9 : 10 })
    await expect(inspectSiteRuntime(env,site.siteId)).rejects.toThrow('route changed during inspection')
  })
})
