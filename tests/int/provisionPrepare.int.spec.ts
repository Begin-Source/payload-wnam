// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ProvisionCloudflare, CloudflareOperationError } from '../../scripts/site-operations/cloudflare'
import { initializeProvisionSchema } from '../../scripts/site-operations/schema'
import { prepareSiteDatabase } from '../../scripts/site-operations/prepare'
import { provisionPlan } from '../../src/site-control/provisionPlan'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { migrateSiteControl } from '../../src/site-control/schema'
import { roleSchemaDigest, type RoleSchema } from '../../scripts/p1-schema'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const accountId = 'd487cf34c606620b442632a72272014d', centralDatabaseId = '10000000-1111-4111-8111-111111111111', databaseId = '20000000-1111-4111-8111-111111111111'
const schema: RoleSchema = { role: 'site',objects: [
  { name: 'items',type: 'table',sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY,value TEXT)' },
  { name: 'items_value',type: 'index',sql: 'CREATE INDEX items_value ON items(value)' },
] }
const makePlan = () => provisionPlan({ operationId: randomUUID(),accountId,centralDatabaseId,centralOrigin: 'https://p1-hub.beginos.org',
  siteId: 'prepared',localSiteId: 103,name: 'Prepared',tenantId: 1,ownerUserId: 7,workerGroup: 'group-1',workerName: 'payload-wnam-p1-sites',
  workerTag: 'e73dabad443148d1a6cede5c19ee203e',expectedDeploymentId: '30000000-1111-4111-8111-111111111111',
  baselineManifestDigest: 'a'.repeat(64),bindingName: 'SITE_D1_NEW',schemaVersion: 1,schemaDigest: roleSchemaDigest(schema.objects),timezone: 'UTC' })
const envelope = (result: unknown,status = 200,headers: Record<string,string> = {}) => Response.json({ success: status === 200,result },{ status,headers })
const noState = async () => {}
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }, central: D1Database, site: D1Database, journal: ProvisionJournal
describe('Cloudflare provisioning preparation and native D1 ownership',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("fixture") } }',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL','SITE'] })
    central = await mf.getD1Database('CENTRAL'); site = await mf.getD1Database('SITE')
    await central.batch([central.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)'),central.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),
      central.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT UNIQUE)'),central.prepare('INSERT INTO users VALUES (7)'),central.prepare('INSERT INTO tenants VALUES (1)')])
    await migrateSiteControl(central)
    journal = new ProvisionJournal(central,{ accountId,centralDatabaseId })
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    await central.batch([central.prepare('DELETE FROM site_provision_steps'),central.prepare('DELETE FROM site_provision_operations')])
    await site.batch([site.prepare('DROP TABLE IF EXISTS items'),site.prepare('DROP TABLE IF EXISTS foreign_data'),site.prepare('DROP TABLE IF EXISTS site_schema_bootstrap')])
  })
  it('uses only the selected account and retries explicit 429 responses with Retry-After',async () => {
    const calls: string[] = [],delays: number[] = []
    const api = new ProvisionCloudflare(accountId,'private-fixture-token',{ random: () => 0,sleep: async ms => { delays.push(ms) },fetch: async (input,init) => {
      calls.push(String(input)); expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-fixture-token')
      expect(init?.redirect).toBe('error')
      return calls.length === 1 ? envelope(null,429,{ 'retry-after': '2' }) : envelope({ ok: true })
    } })
    expect((await api.request('d1/database',{ name: 'prepared' })).result).toEqual({ ok: true })
    expect(calls).toHaveLength(2); expect(delays).toEqual([2000])
    expect(calls.every(url => url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${accountId}/`))).toBe(true)
    await expect(api.request('../other')).rejects.toThrow('Invalid account API path')
    expect(() => new ProvisionCloudflare('different','token')).toThrow('Explicit')
  })
  it('never blindly retries ambiguous writes or returns provider secrets in errors',async () => {
    for (const failure of ['network','server','malformed','forbidden'] as const) {
      let calls = 0
      const api = new ProvisionCloudflare(accountId,'private-fixture-token',{ fetch: async () => {
        calls++
        if (failure === 'network') throw new Error('private-fixture-token')
        if (failure === 'malformed') return new Response('private-fixture-token')
        return Response.json({ success: false,errors: [{ message: 'private-fixture-token' }] },{ status: failure === 'server' ? 503 : 403 })
      } })
      const error = await api.request('d1/database',{ name: 'prepared' }).catch(error => error)
      expect(error).toBeInstanceOf(CloudflareOperationError); expect(String(error)).not.toContain('private-fixture-token')
      expect(error.ambiguous).toBe(failure !== 'forbidden'); expect(calls).toBe(1)
    }
    const api = new ProvisionCloudflare(accountId,'token',{ fetch: async () => envelope(null,429,{ 'retry-after': '900' }),sleep: async () => { throw new Error('Must not shorten provider wait') } })
    await expect(api.request('d1/database',{ name: 'prepared' })).rejects.toThrow('429')
  })
  it('bounds read retries and rejects duplicate resource identities across pages',async () => {
    let calls = 0
    const read = new ProvisionCloudflare(accountId,'token',{ fetch: async () => { calls++; return envelope(null,503) },sleep: noState,random: () => 0 })
    await expect(read.request('workers/scripts')).rejects.toThrow('503'); expect(calls).toBe(5)
    const api = new ProvisionCloudflare(accountId,'token',{ fetch: async input => {
      const url = new URL(String(input))
      return url.search ? Response.json({ success: true,result: [{ uuid: databaseId,name: 'prepared' }],result_info: { total_pages: 2 } }) :
        envelope({ uuid: databaseId,name: 'prepared',created_at: new Date().toISOString(),read_replication: { mode: 'disabled' } })
    } })
    await expect(api.findDatabase('prepared')).rejects.toThrow('Ambiguous database name')
  })
  it('resumes an interrupted owned schema, preserves content and rejects drift or wrong ownership',async () => {
    const plan = makePlan(); let writes = 0
    await expect(initializeProvisionSchema(site,databaseId,plan,schema,{ initializeState: noState,beforeWrite: async () => {
      if (++writes === 2) throw new Error('Injected lost lease before schema batch')
    } })).rejects.toThrow('Injected lost lease')
    expect(await site.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='items'").first('n')).toBe(0)
    const receipt = await initializeProvisionSchema(site,databaseId,plan,schema,{ initializeState: noState,beforeWrite: noState })
    expect(receipt).toMatchObject({ databaseId,objects: 2 })
    await site.prepare("INSERT INTO items VALUES (1,'preserved')").run()
    await initializeProvisionSchema(site,databaseId,plan,schema,{ initializeState: noState,beforeWrite: noState })
    expect(await site.prepare('SELECT value FROM items WHERE id=1').first('value')).toBe('preserved')
    await expect(initializeProvisionSchema(site,randomUUID(),plan,schema,{ initializeState: noState,beforeWrite: noState })).rejects.toThrow('ownership mismatch')
    await site.prepare('DROP INDEX items_value').run()
    await expect(initializeProvisionSchema(site,databaseId,plan,schema,{ initializeState: noState,beforeWrite: noState })).rejects.toThrow('missing objects')
  })
  it('refuses populated databases and rejects a schema not pinned to the operation',async () => {
    const plan = makePlan()
    await site.prepare('CREATE TABLE foreign_data (id INTEGER)').run()
    await expect(initializeProvisionSchema(site,databaseId,plan,schema,{ initializeState: noState,beforeWrite: noState })).rejects.toThrow('unowned')
    await expect(initializeProvisionSchema(site,databaseId,plan,{ ...schema,objects: schema.objects.slice(0,1) },{ initializeState: noState,beforeWrite: noState })).rejects.toThrow('checked plan')
  })
  it('recovers a lost create result through native journal state and repeated preparation creates one DB',async () => {
    const plan = makePlan()
    let creates = 0,resource: { uuid: string; name: string; created_at: string; read_replication: { mode: string } } | null = null
    const api = new ProvisionCloudflare(accountId,'token',{ fetch: async (input,init) => {
      const url = new URL(String(input))
      if (init?.method === 'POST') {
        creates++; const body = JSON.parse(String(init.body))
        expect(body).toEqual({ name: plan.databaseName,primary_location_hint: 'wnam',read_replication: { mode: 'disabled' } })
        resource = { uuid: databaseId,name: body.name,created_at: new Date().toISOString(),read_replication: { mode: 'disabled' } }
        return envelope(resource)
      }
      return envelope(url.search ? resource ? [resource] : [] : resource)
    } })
    const deps = { journal,api,preflight: noState,openDatabase: async () => ({ database: site,close: noState }),initializeState: noState }
    expect(await prepareSiteDatabase(plan,schema,'dry-run',deps)).toMatchObject({ mutations: false,createsDatabase: true })
    expect(await journal.read(plan.operationId)).toBeNull(); expect(creates).toBe(0)
    await expect(prepareSiteDatabase(plan,schema,'apply',{ ...deps,afterCreate: async () => { throw new Error('Injected post-create interruption') } })).rejects.toThrow('Injected post-create')
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 0,pendingStep: 1,databaseId: null,leaseUntil: 0 })
    const restarted = { ...deps,journal: new ProvisionJournal(central,{ accountId,centralDatabaseId }) }
    const result = await prepareSiteDatabase(plan,schema,'apply',restarted)
    expect(result).toMatchObject({ checkpoint: 2,databaseId })
    expect(await prepareSiteDatabase(plan,schema,'apply',restarted)).toEqual(result)
    expect(await journal.plan(plan.operationId)).toEqual(plan)
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 2,pendingStep: null,completedAt: null,leaseUntil: 0 })
    expect(creates).toBe(1)
  })
  it('leaves an unknown missing create pending without sending a second create request',async () => {
    const plan = makePlan(); let creates = 0
    const api = new ProvisionCloudflare(accountId,'token',{ fetch: async (_input,init) => {
      if (init?.method === 'POST') { creates++; throw new Error('Ambiguous response') }
      return envelope([])
    } })
    const deps = { journal,api,preflight: noState,openDatabase: async () => ({ database: site,close: noState }),initializeState: noState }
    await expect(prepareSiteDatabase(plan,schema,'apply',deps)).rejects.toThrow('reconcile required')
    await expect(prepareSiteDatabase(plan,schema,'apply',deps)).rejects.toThrow('no create was replayed')
    expect(creates).toBe(1)
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 0,pendingStep: 1 })
  })
})
