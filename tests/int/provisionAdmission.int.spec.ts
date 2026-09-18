// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync,realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest'
import { provisionAdmissionSchema } from '../../src/site-control/provisionAdmissionSchema'
import { provisionDispatchSchema } from '../../src/site-control/provisionDispatchSchema'
import { provisionDispatchRunSchema } from '../../src/site-control/provisionDispatchRunSchema'
import { cancelProvisionAdmission,listProvisionAdmissions,provisionAdmissionChoices,readProvisionAdmission,submitProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { centralProvisionAdmission } from '../../src/site-control/provisionAdmissionHttp'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { migrateSiteControl } from '../../src/site-control/schema'
import { prepareProvisionAdmission,verifyProvisionAdmissionHandoff } from '../../scripts/site-operations/admission'
import { parseProvisionRequest } from '../../scripts/site-operations/manifest'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> },db: D1Database,journal: ProvisionJournal
const actor = { userId: '7',sessionId: 'central-session' }
const request = () => {
  const value = JSON.parse(readFileSync('operations/provision/p1-c.json','utf8'))
  value.plan.operationId = randomUUID(); value.plan.ownerUserId = 8
  return value
}
const input = (value: ReturnType<typeof request>) => ({ requestId: value.plan.operationId,siteId: value.plan.siteId,
  name: value.plan.name,tenantId: value.plan.tenantId,ownerUserId: value.plan.ownerUserId,timezone: value.plan.timezone })

describe('central provision admission and atomic journal handoff on native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("fixture") } }',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([
      db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY,email TEXT,lock_until TEXT)'),
      db.prepare('CREATE TABLE users_sessions (id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)'),
      db.prepare('CREATE TABLE users_roles (parent_id INTEGER,value TEXT)'),
      db.prepare('CREATE TABLE users_tenants (_parent_id INTEGER,tenant_id INTEGER)'),
      db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY,name TEXT)'),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT)'),
    ])
    await migrateSiteControl(db)
    await db.batch(provisionAdmissionSchema.map(sql => db.prepare(sql)))
    await db.batch(provisionDispatchSchema.map(sql => db.prepare(sql)))
    await db.batch(provisionDispatchRunSchema.map(sql => db.prepare(sql)))
    const { plan } = parseProvisionRequest(request())
    journal = new ProvisionJournal(db,{ accountId: plan.accountId,centralDatabaseId: plan.centralDatabaseId })
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    await db.batch(['site_provision_build_events','site_provision_dispatch_attempts','site_provision_dispatch_runs','site_provision_dispatches','site_provision_requests','site_provision_steps','site_provision_operations','sites','users_sessions','users_roles','users_tenants','users','tenants']
      .map(table => db.prepare(`DELETE FROM ${table}`)))
    await db.batch([
      db.prepare("INSERT INTO users VALUES (7,'manager@example.invalid',NULL),(8,'owner@example.invalid',NULL),(9,'other@example.invalid',NULL)"),
      db.prepare("INSERT INTO users_sessions VALUES ('central-session',7,'2099-01-01'),('other-session',9,'2099-01-01')"),
      db.prepare("INSERT INTO users_roles VALUES (7,'general-manager'),(8,'site-manager'),(9,'general-manager')"),
      db.prepare('INSERT INTO users_tenants VALUES (7,1),(8,1),(9,2)'),
      db.prepare("INSERT INTO tenants VALUES (1,'First tenant'),(2,'Second tenant')"),
      db.prepare("INSERT INTO sites VALUES (102,'existing-numeric-id')"),
    ])
  })
  it('deduplicates concurrent submissions and keeps infrastructure out of input and summaries',async () => {
    const value = request(),human = input(value)
    const results = await Promise.all(Array.from({ length: 10 },() => submitProvisionAdmission(db,actor,human)))
    expect(results.filter(result => !result.replayed)).toHaveLength(1)
    expect(results[0]).toMatchObject({ state: 'queued',checkpoint: null,input: human })
    for (const extra of [{ accountId: value.plan.accountId },{ bindingName: 'SITE_D1_OTHER' },{ apiToken: 'rejected' },{ localSiteId: 100 }]) {
      await expect(submitProvisionAdmission(db,actor,{ ...human,...extra })).rejects.toMatchObject({ status: 400 })
    }
    await expect(submitProvisionAdmission(db,actor,{ ...human,name: 'Changed' })).rejects.toMatchObject({ status: 409 })
    await expect(submitProvisionAdmission(db,actor,{ ...human,requestId: randomUUID() })).rejects.toMatchObject({ status: 409 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n')).toBe(0)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_requests').first('n')).toBe(1)
  })
  it('returns only eligible tenant and owner choices from the live central authority',async () => {
    expect(await provisionAdmissionChoices(db,actor,'tenants')).toEqual({ choices: [{ id: 1,label: 'First tenant' }],nextAfter: null })
    expect((await provisionAdmissionChoices(db,actor,'owners',1)).choices.map(row => row.id)).toEqual([7,8])
    await expect(provisionAdmissionChoices(db,actor,'owners',2)).rejects.toMatchObject({ status: 403 })
    await db.prepare("UPDATE users SET lock_until='2099-01-01' WHERE id=8").run()
    expect((await provisionAdmissionChoices(db,actor,'owners',1)).choices.map(row => row.id)).toEqual([7])
    await db.prepare("UPDATE users_roles SET value='site-manager' WHERE parent_id=7").run()
    expect((await provisionAdmissionChoices(db,actor,'tenants')).choices).toEqual([])
    await db.prepare("UPDATE users_roles SET value='super-admin' WHERE parent_id=7").run()
    expect((await provisionAdmissionChoices(db,actor,'tenants')).choices.map(row => row.id)).toEqual([1,2])
    await db.prepare('DELETE FROM users_sessions WHERE _parent_id=7').run()
    await expect(provisionAdmissionChoices(db,actor,'tenants')).rejects.toMatchObject({ status: 401 })
  })
  it('paginates durable requests without leaking another tenant or dropping cancelled entries',async () => {
    const base = input(request())
    const humans = Array.from({ length: 52 },(_,index) => ({ ...base,requestId: randomUUID(),siteId: `page-${index}` }))
    await Promise.all(humans.map(human => submitProvisionAdmission(db,actor,human)))
    await cancelProvisionAdmission(db,actor,humans[0].requestId)
    const foreign = { ...base,requestId: randomUUID(),siteId: 'foreign-page',tenantId: 2,ownerUserId: 9 }
    await submitProvisionAdmission(db,{ userId: '9',sessionId: 'other-session' },foreign)
    const first = await listProvisionAdmissions(db,actor,1),second = await listProvisionAdmissions(db,actor,1,first.nextCursor!)
    expect(first.requests).toHaveLength(50); expect(second.requests).toHaveLength(2); expect(second.nextCursor).toBeNull()
    const all = [...first.requests,...second.requests]
    expect(new Set(all.map(value => value.requestId)).size).toBe(52)
    expect(all.every(value => value.input.tenantId === 1)).toBe(true)
    expect(all.find(value => value.requestId === humans[0].requestId)?.state).toBe('cancelled')
    expect(JSON.stringify(all)).not.toMatch(/prepared|databaseId|bindingName|workerGroup/)
    await expect(listProvisionAdmissions(db,actor,1,foreign.requestId)).rejects.toMatchObject({ status: 400 })
    await expect(listProvisionAdmissions(db,actor,2)).rejects.toMatchObject({ status: 403 })
    await db.prepare('DELETE FROM users_tenants WHERE _parent_id=7').run()
    await expect(listProvisionAdmissions(db,actor,1)).rejects.toMatchObject({ status: 403 })
  },30000)
  it('bounds the HTTP transport, authenticates central sessions and keeps submit/read/cancel private',async () => {
    const origin = 'https://p1-hub.beginos.org',human = input(request())
    const call = (path: string,init: RequestInit = {},authenticated = true) => centralProvisionAdmission(new Request(origin+path,init),{
      centralOrigin: origin,database: db,authenticate: async () => authenticated ? actor : null })
    const post = (body: unknown,extra: Record<string,string> = {}) => ({ method: 'POST',headers: { 'content-type': 'application/json',origin,...extra },body: JSON.stringify(body) })
    expect((await call('/auth/site-request',post(human),false)).status).toBe(401)
    expect((await call('/auth/site-request',post(human,{ origin: 'https://foreign.example' }))).status).toBe(403)
    expect((await call('/auth/site-request',{ ...post(human),headers: { 'content-type': 'application/json' } })).status).toBe(403)
    expect((await call('/auth/site-request',post({ ...human,name: 'x'.repeat(2200) }))).status).toBe(400)
    expect((await call('/auth/site-request',post({ ...human,workerName: 'forged' }))).status).toBe(400)
    expect((await call('/auth/site-request?requestId=forged',post(human))).status).toBe(400)
    expect((await call('/auth/site-requests?tenantId=1&tenantId=2')).status).toBe(400)
    expect((await call('/auth/site-provision-options?kind=tenants&tenantId=2')).status).toBe(400)
    expect((await call('/auth/site-requests',{ method: 'POST' })).status).toBe(405)
    expect((await call('/auth/site-request-other')).status).toBe(404)
    const saved = await call('/auth/site-request',post(human))
    expect(saved.status).toBe(200); expect(saved.headers.get('cache-control')).toBe('private, no-store')
    expect(await saved.json()).toMatchObject({ state: 'queued',replayed: false })
    expect(await (await call('/auth/site-request',post(human))).json()).toMatchObject({ replayed: true })
    expect(await (await call(`/auth/site-request?requestId=${human.requestId}`)).json()).toMatchObject({ input: human,state: 'queued' })
    expect(await (await call('/auth/site-requests?tenantId=1')).json()).toMatchObject({ requests: [{ input: human }] })
    expect((await call('/auth/site-request-cancel',post({ requestId: human.requestId,extra: true }))).status).toBe(400)
    expect(await (await call('/auth/site-request-cancel',post({ requestId: human.requestId }))).json()).toMatchObject({ state: 'cancelled' })
    expect(await (await call('/auth/site-request-cancel',post({ requestId: human.requestId }))).json()).toMatchObject({ state: 'cancelled' })
    expect(await journal.read(human.requestId)).toBeNull()
    await db.prepare('DELETE FROM users_sessions WHERE _parent_id=7').run()
    expect((await call(`/auth/site-request?requestId=${human.requestId}`)).status).toBe(401)
  })
  it('allocates unique stable numeric IDs atomically and never reuses cancelled IDs',async () => {
    const first = input(request())
    const inputs = Array.from({ length: 12 },(_,index) => ({ ...first,requestId: randomUUID(),siteId: `allocated-${index}` }))
    await Promise.all(inputs.map(value => submitProvisionAdmission(db,actor,value)))
    const before = (await db.prepare('SELECT request_id,local_site_id FROM site_provision_requests ORDER BY local_site_id').all<{ request_id: string; local_site_id: number }>()).results
    expect(before.map(row => row.local_site_id)).toEqual(Array.from({ length: 12 },(_,index) => index+103))
    await cancelProvisionAdmission(db,actor,inputs[0].requestId)
    await submitProvisionAdmission(db,actor,{ ...inputs[0],requestId: randomUUID() })
    expect(await db.prepare('SELECT MAX(local_site_id) AS n FROM site_provision_requests').first('n')).toBe(115)
    await submitProvisionAdmission(db,actor,inputs[1])
    expect(await db.prepare('SELECT local_site_id FROM site_provision_requests WHERE request_id=?').bind(inputs[1].requestId).first('local_site_id'))
      .toBe(before.find(row => row.request_id === inputs[1].requestId)!.local_site_id)
    const reused = request(); reused.plan.siteId = 'foreign-site'; reused.plan.localSiteId = before.find(row => row.request_id === inputs[0].requestId)!.local_site_id
    await expect(journal.reserve(parseProvisionRequest(reused).plan)).rejects.toThrow('admission')
  })
  it('requires live sessions and tenant-scoped manager/owner authority',async () => {
    const human = input(request())
    await expect(submitProvisionAdmission(db,{ ...actor,sessionId: 'forged' },human)).rejects.toMatchObject({ status: 401 })
    await expect(submitProvisionAdmission(db,actor,{ ...human,tenantId: 2 })).rejects.toMatchObject({ status: 403 })
    await expect(submitProvisionAdmission(db,actor,{ ...human,ownerUserId: 9 })).rejects.toMatchObject({ status: 409 })
    await submitProvisionAdmission(db,actor,human)
    await expect(readProvisionAdmission(db,{ userId: '9',sessionId: 'other-session' },human.requestId)).rejects.toMatchObject({ status: 403 })
    await db.prepare("UPDATE users SET lock_until='invalid' WHERE id=7").run()
    await expect(readProvisionAdmission(db,actor,human.requestId)).rejects.toMatchObject({ status: 401 })
  })
  it('persists one checked plan and reserves the existing journal atomically without changing human input',async () => {
    const value = request(),human = input(value)
    await submitProvisionAdmission(db,actor,human)
    await expect(journal.reserve(parseProvisionRequest(value).plan)).rejects.toThrow('unprepared')
    const prepared = await prepareProvisionAdmission(db,value)
    await prepareProvisionAdmission(db,value)
    const changed = structuredClone(value); changed.plan.localSiteId++
    await expect(prepareProvisionAdmission(db,changed)).rejects.toThrow('allocated site ID')
    const operations = await Promise.all(Array.from({ length: 8 },() => journal.reserve(prepared.plan)))
    expect(operations.every(operation => operation.checkpoint === 0)).toBe(true)
    const summary = await readProvisionAdmission(db,actor,human.requestId)
    expect(summary).toMatchObject({ state: 'provisioning',checkpoint: 0,input: human })
    expect(summary).not.toHaveProperty('prepared_request_json')
    await expect(cancelProvisionAdmission(db,actor,human.requestId)).rejects.toMatchObject({ status: 409 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n')).toBe(1)
  })
  it('keeps request-ID previews read-only and requires the exact durable plan before apply',async () => {
    const value = request(),human = input(value)
    await submitProvisionAdmission(db,actor,human)
    const before = (await db.prepare('SELECT * FROM site_provision_requests').all()).results
    await verifyProvisionAdmissionHandoff(db,human.requestId,value,'dry-run')
    expect((await db.prepare('SELECT * FROM site_provision_requests').all()).results).toEqual(before)
    expect(await journal.read(human.requestId)).toBeNull()
    await expect(verifyProvisionAdmissionHandoff(db,human.requestId,value,'apply')).rejects.toThrow('persisted prepared')
    await expect(verifyProvisionAdmissionHandoff(db,randomUUID(),value,'apply')).rejects.toThrow('selection mismatch')
    const wrongOwner = structuredClone(value); wrongOwner.plan.ownerUserId = 7
    await expect(verifyProvisionAdmissionHandoff(db,human.requestId,wrongOwner,'dry-run')).rejects.toThrow('human request')
    await prepareProvisionAdmission(db,value)
    await verifyProvisionAdmissionHandoff(db,human.requestId,value,'apply')
    const foreignCapability = structuredClone(value); foreignCapability.central.r2_buckets[0].bucket_name = 'foreign-central-media'
    await expect(verifyProvisionAdmissionHandoff(db,human.requestId,foreignCapability,'apply')).rejects.toThrow('immutable prepared')
    const differentDeployment = structuredClone(value); differentDeployment.plan.expectedDeploymentId = randomUUID()
    await expect(verifyProvisionAdmissionHandoff(db,human.requestId,differentDeployment,'apply')).rejects.toThrow('immutable prepared')
    const cancelled = await cancelProvisionAdmission(db,actor,human.requestId)
    expect(cancelled.state).toBe('cancelled')
    await expect(verifyProvisionAdmissionHandoff(db,human.requestId,value,'apply')).rejects.toThrow('cancelled')
    expect(await journal.read(human.requestId)).toBeNull()
  })
  it('rechecks preview eligibility and resumes the original reservation after a lost handoff response',async () => {
    const value = request(),human = input(value)
    await submitProvisionAdmission(db,actor,human)
    await db.prepare('DELETE FROM users_tenants WHERE _parent_id=7').run()
    await expect(verifyProvisionAdmissionHandoff(db,human.requestId,value,'dry-run')).rejects.toThrow('lost permission')
    await db.prepare('INSERT INTO users_tenants VALUES (7,1)').run()
    await prepareProvisionAdmission(db,value)
    await verifyProvisionAdmissionHandoff(db,human.requestId,value,'apply')
    // Losing the executor's response does not permit a new operation or plan.
    const reserved = await journal.reserve(parseProvisionRequest(value).plan)
    await verifyProvisionAdmissionHandoff(db,human.requestId,JSON.parse(JSON.stringify(value)),'apply')
    expect(await journal.reserve(parseProvisionRequest(value).plan)).toEqual(reserved)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n')).toBe(1)
    expect(await readProvisionAdmission(db,actor,human.requestId)).toMatchObject({ state: 'provisioning',checkpoint: 0 })
  })
  it('serializes cancellation versus reservation and never creates an operation for the cancelled winner',async () => {
    const value = request(),human = input(value)
    await submitProvisionAdmission(db,actor,human)
    const prepared = await prepareProvisionAdmission(db,value)
    await Promise.allSettled([cancelProvisionAdmission(db,actor,human.requestId),journal.reserve(prepared.plan)])
    const state = await readProvisionAdmission(db,actor,human.requestId),operation = await journal.read(human.requestId)
    if (state.state === 'cancelled') {
      expect(operation).toBeNull()
      await expect(journal.reserve(prepared.plan)).rejects.toThrow('cancelled')
      await submitProvisionAdmission(db,actor,{ ...human,requestId: randomUUID() })
    } else {
      expect(state.state).toBe('provisioning'); expect(operation?.checkpoint).toBe(0)
      await expect(cancelProvisionAdmission(db,actor,human.requestId)).rejects.toMatchObject({ status: 409 })
    }
  })
  it('rechecks actor and owner permissions in the reservation after preparing the plan',async () => {
    const value = request(),human = input(value)
    await submitProvisionAdmission(db,actor,human)
    const prepared = await prepareProvisionAdmission(db,value)
    for (const id of [7,8]) {
      await db.prepare('DELETE FROM users_tenants WHERE _parent_id=?').bind(id).run()
      await expect(journal.reserve(prepared.plan)).rejects.toThrow('unauthorized')
      expect(await journal.read(human.requestId)).toBeNull()
      await db.prepare('INSERT INTO users_tenants VALUES (?,1)').bind(id).run()
    }
    await db.prepare("UPDATE users_roles SET value='site-manager' WHERE parent_id=7").run()
    await expect(journal.reserve(prepared.plan)).rejects.toThrow('unauthorized')
  })
  it('blocks alternate operation IDs from taking queued sites and rejects altered ownership',async () => {
    const value = request(),human = input(value)
    await submitProvisionAdmission(db,actor,human)
    const different = structuredClone(value); different.plan.operationId = randomUUID()
    await expect(journal.reserve(parseProvisionRequest(different).plan)).rejects.toThrow('admission')
    const changed = structuredClone(value); changed.plan.ownerUserId = 7
    await expect(prepareProvisionAdmission(db,changed)).rejects.toThrow('human request')
    await db.prepare("UPDATE users_tenants SET tenant_id=2 WHERE _parent_id=7").run()
    await expect(prepareProvisionAdmission(db,value)).rejects.toThrow('lost permission')
    expect(await journal.read(human.requestId)).toBeNull()
  })
})
