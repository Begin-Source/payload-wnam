// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync,realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { createCentralPayloadConfig } from '../../src/site-control/config'
import { createSitePayloadConfig } from '../../src/site-runtime/config'
import { migrateCentralRoleState, migrateSiteRoleState } from '../../src/application-roles/schema'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionDigest,provisionPlan } from '../../src/site-control/provisionPlan'
import { readProvisionAdmission,submitProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { initializeProvisionSchema } from '../../scripts/site-operations/schema'
import { seedProvisionedSite } from '../../scripts/site-operations/seed'
import { prepareSiteDatabase } from '../../scripts/site-operations/prepare'
import { finishProvisionedSite,type GroupDeployment } from '../../scripts/site-operations/finish'
import { provisionSite,type ProvisionMode } from '../../scripts/site-operations/provision'
import { ProvisionCloudflare } from '../../scripts/site-operations/cloudflare'
import { prepareProvisionAdmission,verifyProvisionAdmissionHandoff } from '../../scripts/site-operations/admission'
import { parseProvisionRequest,provisionManifest } from '../../scripts/site-operations/manifest'
import { roleSchemaDigest, type RoleSchema } from '../../scripts/p1-schema'

vi.mock('../../src/payload.config',() => { throw new Error('Shared Payload config imported') })
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const accountId = 'd487cf34c606620b442632a72272014d',centralDatabaseId = '10000000-1111-4111-8111-111111111111'
const external = vi.fn(async () => { throw new Error('External capability invoked during seed') })
const noop = async () => {}
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let central: D1Database,centralPayload: Payload,sitePayload: Payload,journal: ProvisionJournal,siteSchema: RoleSchema,index = 0
async function payloadSchema(payload: Payload,db: D1Database) {
  const adapter = payload.db as unknown as { schema: unknown; defaultDrizzleSnapshot: unknown; requireDrizzleKit: () => {
    generateDrizzleJson: (schema: unknown) => unknown; generateMigration: (before: unknown,after: unknown) => Promise<string[]> } }
  const kit = adapter.requireDrizzleKit(),sql = await kit.generateMigration(adapter.defaultDrizzleSnapshot,await kit.generateDrizzleJson(adapter.schema))
  for (let offset = 0; offset < sql.length; offset += 25) await db.batch(sql.slice(offset,offset+25).map(sql => db.prepare(sql)))
}
async function fixture(prepared = true) {
  const n = ++index,local = await mf.getD1Database(`S${n}`),databaseId = randomUUID()
  const plan = provisionPlan({ operationId: randomUUID(),accountId,centralDatabaseId,centralOrigin: 'https://p1-hub.beginos.org',
    siteId: `seed-${n}`,localSiteId: 100+n,name: `Seed ${n}`,tenantId: 1,ownerUserId: 7,workerGroup: `group-${n}`,
    workerName: 'payload-wnam-p1-sites',workerTag: 'e73dabad443148d1a6cede5c19ee203e',expectedDeploymentId: randomUUID(),
    baselineManifestDigest: 'a'.repeat(64),bindingName: 'SITE_D1_NEW',schemaVersion: 1,schemaDigest: roleSchemaDigest(siteSchema.objects),timezone: 'UTC' })
  if (prepared) {
    await journal.reserve(plan)
    const lease = await journal.claim(plan.operationId)
    await journal.begin(lease,'database','a'.repeat(64))
    await journal.finish(lease,'database','a'.repeat(64),{ databaseId,databaseName: plan.databaseName,readReplication: 'disabled' })
    await journal.begin(lease,'schema','b'.repeat(64))
    const receipt = await initializeProvisionSchema(local,databaseId,plan,siteSchema,{ beforeWrite: noop })
    await journal.finish(lease,'schema','b'.repeat(64),receipt); await journal.release(lease)
  }
  return { plan,local,databaseId,deps: { journal,centralDatabase: central,siteDatabase: local,centralPayload,sitePayload,preflight: noop } }
}
describe('provision seed with full Payload roles and native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',
      d1Databases: ['CENTRAL','TEMPLATE','S1','S2','S3','S4','S5'],r2Buckets: ['CENTRAL','PUBLIC','PRIVATE'] })
    central = await mf.getD1Database('CENTRAL')
    centralPayload = await getPayload({ key: 'provision-seed-central',disableOnInit: true,config: await createCentralPayloadConfig({ database: central,
      bucket: await mf.getR2Bucket('CENTRAL'),secret: 'isolated-provision-central',generationModels: [],authorizeAiGeneration: external }) })
    sitePayload = await getPayload({ key: 'provision-seed-site',disableOnInit: true,config: await createSitePayloadConfig({ secret: 'isolated-provision-site',
      identity: { authenticate: external,redeem: external,logout: external },publicBucket: await mf.getR2Bucket('PUBLIC'),privateBucket: await mf.getR2Bucket('PRIVATE'),
      generationModels: [],authorizeAiGeneration: external,executeExternalTask: external }) })
    await payloadSchema(centralPayload,central); await migrateCentralRoleState(central)
    const template = await mf.getD1Database('TEMPLATE')
    await payloadSchema(sitePayload,template); await migrateSiteRoleState(template)
    siteSchema = { role: 'site',objects: (await template.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY rowid").all<RoleSchema['objects'][number]>()).results }
    await centralPayload.create({ collection: 'tenants',data: { id: 1,name: 'Seed tenant',slug: 'seed-tenant',domain: 'seed.example.invalid' } })
    await centralPayload.create({ collection: 'users',user: { id: 7,collection: 'users',email: 'seed@example.invalid',roles: ['super-admin'] } as never,
      data: { id: 7,email: 'seed@example.invalid',password: 'isolated-seed-fixture-only',roles: ['super-admin'],tenants: [{ tenant: 1 }] } })
    journal = new ProvisionJournal(central,{ accountId,centralDatabaseId })
  },120000)
  afterAll(async () => { await sitePayload?.destroy(); await centralPayload?.destroy(); await mf?.dispose() })
  it('previews without journal, registry, grant or local content writes',async () => {
    const { plan,local,deps } = await fixture(),before = await journal.read(plan.operationId)
    expect(await seedProvisionedSite(plan,'dry-run',deps)).toMatchObject({ mutations: false,checkpoint: 2 })
    expect(await journal.read(plan.operationId)).toEqual(before)
    expect(await journal.step(plan.operationId,'seed')).toBeNull()
    expect(await local.prepare('SELECT COUNT(*) AS n FROM sites').first('n')).toBe(0)
    expect(await central.prepare('SELECT COUNT(*) AS n FROM site_runtime_registry WHERE site_id=?').bind(plan.siteId).first('n')).toBe(0)
  },30000)
  it('resumes between databases, copies only identity projections and preserves labels and receipts on retry',async () => {
    const { plan,local,deps } = await fixture()
    await expect(seedProvisionedSite(plan,'apply',{ ...deps,afterLocalSeed: async () => { throw new Error('Injected interruption after local seed') } })).rejects.toThrow('Injected interruption')
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 2,pendingStep: 3,leaseUntil: 0 })
    expect(await local.prepare('SELECT COUNT(*) AS n FROM sites').first('n')).toBe(1)
    expect(await central.prepare('SELECT COUNT(*) AS n FROM sites WHERE id=?').bind(plan.localSiteId).first('n')).toBe(0)
    const result = await seedProvisionedSite(plan,'apply',deps)
    expect(result).toMatchObject({ checkpoint: 3,mutations: true })
    const receipt = await journal.step(plan.operationId,'seed')
    await local.prepare('UPDATE sites SET name=? WHERE id=?').bind('Retained editorial label',plan.localSiteId).run()
    await central.prepare('UPDATE sites SET name=? WHERE id=?').bind('Retained central label',plan.localSiteId).run()
    expect(await seedProvisionedSite(plan,'apply',deps)).toMatchObject({ checkpoint: 3,mutations: false })
    expect(await journal.step(plan.operationId,'seed')).toEqual(receipt)
    expect(await local.prepare('SELECT name FROM sites WHERE id=?').bind(plan.localSiteId).first('name')).toBe('Retained editorial label')
    expect(await central.prepare('SELECT name FROM sites WHERE id=?').bind(plan.localSiteId).first('name')).toBe('Retained central label')
    expect(await central.prepare('SELECT migration_state,routing_version,production_enabled FROM site_runtime_registry WHERE site_id=?').bind(plan.siteId).first())
      .toEqual({ migration_state: 'provisioning',routing_version: 1,production_enabled: 0 })
    const columns = (await local.prepare('PRAGMA table_info(users)').all<{ name: string }>()).results.map(row => row.name)
    for (const field of ['hash','salt','email','password','roles']) expect(columns).not.toContain(field)
    expect(await local.prepare('SELECT central_user_id FROM users').first('central_user_id')).toBe('7')
    expect(external).not.toHaveBeenCalled()
    await central.prepare("UPDATE site_runtime_access SET role='viewer' WHERE site_id=?").bind(plan.siteId).run()
    await expect(seedProvisionedSite(plan,'apply',deps)).rejects.toThrow('Seed permission changed')
    expect(await central.prepare('SELECT role FROM site_runtime_access WHERE site_id=?').bind(plan.siteId).first('role')).toBe('viewer')
  },45000)
  it('refuses a populated local target before recording seed intent',async () => {
    const { plan,local,deps } = await fixture()
    await local.prepare("INSERT INTO users (id,central_user_id,display_name,created_at,updated_at) VALUES (1,'8','Foreign',?,?)").bind(new Date().toISOString(),new Date().toISOString()).run()
    await expect(seedProvisionedSite(plan,'apply',deps)).rejects.toThrow('Local seed identity conflict')
    expect(await journal.step(plan.operationId,'seed')).toBeNull()
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 2,leaseUntil: 0 })
  },30000)
  it('refuses changed ownership and refuses to replay after route activation',async () => {
    const { plan,local,deps } = await fixture()
    await local.prepare('UPDATE site_schema_bootstrap SET database_id=? WHERE id=1').bind(randomUUID()).run()
    await expect(seedProvisionedSite(plan,'apply',deps)).rejects.toThrow('Seed database ownership mismatch')
    const operation = await journal.read(plan.operationId)
    await local.prepare('UPDATE site_schema_bootstrap SET database_id=? WHERE id=1').bind(operation!.databaseId).run()
    await seedProvisionedSite(plan,'apply',deps)
    await central.prepare("UPDATE site_runtime_registry SET migration_state='active',routing_version=2 WHERE site_id=?").bind(plan.siteId).run()
    await expect(seedProvisionedSite(plan,'apply',deps)).rejects.toThrow('Seed cannot alter an existing route')
  },30000)
  it('runs a durable admission through six stages, resumes seed/upload failures and never replays completed effects',async () => {
    const f = await fixture(false),createdAt = new Date().toISOString()
    const raw = JSON.parse(readFileSync('operations/provision/p1-c.json','utf8'))
    raw.central.d1_databases[0].database_id = centralDatabaseId
    raw.baseline.vars.WORKER_GROUP = f.plan.workerGroup
    const { adminHost: _host,databaseName: _database,productionEnabled: _production,readReplication: _replication,locationHint: _location,...inputPlan } = f.plan
    raw.plan = { ...inputPlan,baselineManifestDigest: provisionDigest(JSON.stringify(raw.baseline)) }
    f.plan = parseProvisionRequest(raw).plan
    const digest = provisionDigest(JSON.stringify(provisionManifest(parseProvisionRequest(raw),f.databaseId)))
    await centralPayload.login({ collection: 'users',data: { email: 'seed@example.invalid',password: 'isolated-seed-fixture-only' } })
    const sessionId = await central.prepare('SELECT id FROM users_sessions WHERE _parent_id=7 LIMIT 1').first<string>('id')
    expect(sessionId).toBeTruthy()
    const actor = { userId: '7',sessionId: sessionId! }
    await submitProvisionAdmission(central,actor,{ requestId: f.plan.operationId,siteId: f.plan.siteId,name: f.plan.name,
      tenantId: f.plan.tenantId,ownerUserId: f.plan.ownerUserId,timezone: f.plan.timezone })
    let activeMode: ProvisionMode = 'dry-run'
    const preflight = () => verifyProvisionAdmissionHandoff(central,f.plan.operationId,raw,activeMode)
    let created = false,creates = 0,uploads = 0,seedInterruption = true,uploadInterruption = true
    let deployment: (GroupDeployment & { operationId: string }) | null = null
    const info = { uuid: f.databaseId,name: f.plan.databaseName,created_at: createdAt,read_replication: { mode: 'disabled' } }
    const api = new ProvisionCloudflare(accountId,'isolated-command-fixture',{ fetch: async (input,init) => {
      if (init?.method === 'POST') { creates++; created = true; return Response.json({ success: true,result: info }) }
      const list = new URL(String(input)).searchParams.has('name')
      return Response.json({ success: true,result: list ? created ? [info] : [] : info })
    } })
    const finishDeps = { journal,centralDatabase: central,manifestDigest: digest,preflight,currentDeployment: async () => deployment,
      deploy: async () => { uploads++; deployment = { deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest: digest,commit: 'd'.repeat(40),operationId: f.plan.operationId } },
      afterDeploy: async () => { if (uploadInterruption) { uploadInterruption = false; throw new Error('Injected command upload interruption') } },
      verify: async () => {
        expect(await f.local.prepare('SELECT operation_id FROM site_schema_bootstrap WHERE id=1').first('operation_id')).toBe(f.plan.operationId)
        expect(await f.local.prepare('SELECT slug FROM sites WHERE id=?').bind(f.plan.localSiteId).first('slug')).toBe(f.plan.siteId)
        return { nativeBindingVerified: true }
      },acceptance: noop }
    const stages = { journal,
      prepare: vi.fn((mode: ProvisionMode) => prepareSiteDatabase(f.plan,siteSchema,mode,{ journal,api,preflight,
        openDatabase: async id => { expect(id).toBe(f.databaseId); return { database: f.local,close: noop } } })),
      seed: vi.fn((mode: ProvisionMode) => seedProvisionedSite(f.plan,mode,{ ...f.deps,preflight,afterLocalSeed: async () => {
        if (seedInterruption) { seedInterruption = false; throw new Error('Injected command seed interruption') }
      } })),
      finish: vi.fn((mode: ProvisionMode) => finishProvisionedSite(f.plan,mode,finishDeps)),
      verifyCompleted: async () => { await finishProvisionedSite(f.plan,'dry-run',finishDeps); return finishDeps.verify() },
    }
    const invoke = async (mode: ProvisionMode) => {
      activeMode = mode
      await preflight()
      return provisionSite(f.plan,mode,stages)
    }
    expect(await invoke('dry-run')).toMatchObject({ checkpoint: 0,mutations: false,remaining: ['database','schema','seed','deploy','verify','activate'] })
    expect(await journal.read(f.plan.operationId)).toBeNull(); expect(creates).toBe(0)
    expect(await central.prepare('SELECT prepared_request_json FROM site_provision_requests WHERE request_id=?').bind(f.plan.operationId).first('prepared_request_json')).toBeNull()
    await prepareProvisionAdmission(central,raw)
    await expect(invoke('apply')).rejects.toThrow('Injected command seed interruption')
    expect(await journal.read(f.plan.operationId)).toMatchObject({ checkpoint: 2,pendingStep: 3,leaseUntil: 0 })
    stages.prepare.mockClear()
    expect(await invoke('dry-run')).toMatchObject({ checkpoint: 2,mutations: false })
    await expect(invoke('apply')).rejects.toThrow('Injected command upload interruption')
    expect(await journal.read(f.plan.operationId)).toMatchObject({ checkpoint: 3,pendingStep: 4,leaseUntil: 0 })
    stages.seed.mockClear()
    expect(await invoke('apply')).toMatchObject({ checkpoint: 6,complete: true,resumed: true })
    expect(stages.prepare).not.toHaveBeenCalled(); expect(stages.seed).not.toHaveBeenCalled()
    expect(creates).toBe(1); expect(uploads).toBe(1)
    const receipts = (await central.prepare('SELECT * FROM site_provision_steps WHERE operation_id=? ORDER BY step').bind(f.plan.operationId).all()).results
    stages.finish.mockClear()
    expect(await invoke('apply')).toMatchObject({ complete: true,mutations: false })
    expect(await invoke('dry-run')).toMatchObject({ complete: true,mutations: false })
    expect(stages.finish).not.toHaveBeenCalled()
    expect((await central.prepare('SELECT * FROM site_provision_steps WHERE operation_id=? ORDER BY step').bind(f.plan.operationId).all()).results).toEqual(receipts)
    expect(await readProvisionAdmission(central,actor,f.plan.operationId)).toMatchObject({ state: 'completed',checkpoint: 6 })
    console.log(JSON.stringify({ event: 'admission_six_stage_recovery_passed',checkpoint: 6,databaseCreates: creates,workerUploads: uploads,
      immutablePreparedRequest: true,repeatReceiptsUnchanged: true,remoteDeployment: false }))
  },120000)
})
