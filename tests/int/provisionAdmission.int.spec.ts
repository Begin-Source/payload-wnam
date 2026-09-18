// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync,realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest'
import { provisionAdmissionSchema } from '../../src/site-control/provisionAdmissionSchema'
import { cancelProvisionAdmission,readProvisionAdmission,submitProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { migrateSiteControl } from '../../src/site-control/schema'
import { prepareProvisionAdmission } from '../../scripts/site-operations/admission'
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
      db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT)'),
    ])
    await migrateSiteControl(db)
    await db.batch(provisionAdmissionSchema.map(sql => db.prepare(sql)))
    const { plan } = parseProvisionRequest(request())
    journal = new ProvisionJournal(db,{ accountId: plan.accountId,centralDatabaseId: plan.centralDatabaseId })
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    await db.batch(['site_provision_requests','site_provision_steps','site_provision_operations','sites','users_sessions','users_roles','users_tenants','users','tenants']
      .map(table => db.prepare(`DELETE FROM ${table}`)))
    await db.batch([
      db.prepare("INSERT INTO users VALUES (7,'manager@example.invalid',NULL),(8,'owner@example.invalid',NULL),(9,'other@example.invalid',NULL)"),
      db.prepare("INSERT INTO users_sessions VALUES ('central-session',7,'2099-01-01'),('other-session',9,'2099-01-01')"),
      db.prepare("INSERT INTO users_roles VALUES (7,'general-manager'),(8,'site-manager'),(9,'general-manager')"),
      db.prepare('INSERT INTO users_tenants VALUES (7,1),(8,1),(9,2)'),
      db.prepare('INSERT INTO tenants VALUES (1),(2)'),
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
    await expect(prepareProvisionAdmission(db,changed)).rejects.toThrow('different prepared plan')
    const operations = await Promise.all(Array.from({ length: 8 },() => journal.reserve(prepared.plan)))
    expect(operations.every(operation => operation.checkpoint === 0)).toBe(true)
    const summary = await readProvisionAdmission(db,actor,human.requestId)
    expect(summary).toMatchObject({ state: 'provisioning',checkpoint: 0,input: human })
    expect(summary).not.toHaveProperty('prepared_request_json')
    await expect(cancelProvisionAdmission(db,actor,human.requestId)).rejects.toMatchObject({ status: 409 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n')).toBe(1)
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
