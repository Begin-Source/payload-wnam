// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ProvisionJournal, provisionSteps } from '../../src/site-control/provisionJournal'
import { provisionPlan, provisionDigest, serializeProvisionPlan, type ProvisionInput } from '../../src/site-control/provisionPlan'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { withSiteContext } from '../../src/site-runtime/context'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }, db: D1Database, journal: ProvisionJournal
const centralDatabaseId = '10000000-1111-4111-8111-111111111111', databaseId = '20000000-1111-4111-8111-111111111111'
const accountId = 'd487cf34c606620b442632a72272014d', target = { accountId,centralDatabaseId }
const digest = 'a'.repeat(64), deploymentId = '30000000-1111-4111-8111-111111111111'
const input = (overrides: Partial<ProvisionInput> = {}): ProvisionInput => ({
  operationId: randomUUID(),accountId,centralDatabaseId,centralOrigin: 'https://p1-hub.beginos.org',
  siteId: 'new-site',localSiteId: 103,name: 'New site',tenantId: 1,ownerUserId: 7,
  workerGroup: 'group-1',workerName: 'payload-wnam-p1-sites',workerTag: 'e73dabad443148d1a6cede5c19ee203e',
  expectedDeploymentId: deploymentId,baselineManifestDigest: digest,bindingName: 'SITE_D1_NEW',schemaVersion: 1,schemaDigest: digest,timezone: 'UTC',...overrides,
})
const intent = (step: string) => provisionDigest(`native-fixture-${step}`)
const dbReceipt = (plan: ReturnType<typeof provisionPlan>) => ({ databaseId,databaseName: plan.databaseName,readReplication: 'disabled' })

describe('durable site provision plans and maintenance journal on native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("fixture") } }',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([
      db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)'),db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT UNIQUE)'),
    ])
    await migrateSiteControl(db)
    journal = new ProvisionJournal(db,target)
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    await db.batch(['site_provision_steps','site_provision_operations','site_lifecycle_operations','site_login_tickets','site_login_sessions',
      'site_runtime_access','site_runtime_registry','sites','users','tenants'].map(table => db.prepare(`DELETE FROM ${table}`)))
    await db.batch([db.prepare('INSERT INTO users VALUES (7)'),db.prepare('INSERT INTO tenants VALUES (1)')])
  })
  it('requires exact reviewed identity and stable targets without accepting credentials or production enablement',() => {
    const source = input(), plan = provisionPlan(source)
    expect(plan.productionEnabled).toBe(false); expect(plan.readReplication).toBe('disabled')
    expect(plan.adminHost).toBe('cms-site-new-site.beginos.org'); expect(plan.databaseName.length).toBeLessThanOrEqual(64)
    expect(serializeProvisionPlan(plan)).toBe(serializeProvisionPlan(provisionPlan(Object.fromEntries(Object.entries(source).reverse()))))
    for (const patch of [{ accountId: 'other' },{ siteId: ['new-site'] },{ siteId: 'cms-site-a.beginos.org' },{ timezone: 'invented-zone' },
      { localSiteId: 0 },{ centralOrigin: 'https://evil.example' },{ expectedDeploymentId: '' },{ apiToken: 'never-store' },{ productionEnabled: true }]) {
      expect(() => provisionPlan({ ...source,...patch })).toThrow()
    }
    expect(() => serializeProvisionPlan({ ...plan,databaseName: 'foreign' })).toThrow('derived fields')
  })
  it('previews without writes and atomically deduplicates concurrent reservations',async () => {
    const plan = provisionPlan(input())
    expect(await journal.preview(plan)).toMatchObject({ mode: 'new',groupSize: 0 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n')).toBe(0)
    const results = await Promise.all(Array.from({ length: 20 },() => journal.reserve(plan)))
    expect(new Set(results.map(result => result.planDigest)).size).toBe(1)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n')).toBe(1)
    expect(await journal.preview(plan)).toMatchObject({ mode: 'resume',operation: { checkpoint: 0 } })
    await expect(journal.reserve(provisionPlan(input({ operationId: plan.operationId,name: 'changed' })))).rejects.toThrow('conflict')
    await expect(journal.preview(provisionPlan(input({ operationId: plan.operationId,name: 'changed' })))).rejects.toThrow('different plan')
  })
  it('holds site, numeric ID and group reservations even after releasing an execution lease',async () => {
    const plan = provisionPlan(input()); await journal.reserve(plan)
    const lease = await journal.claim(plan.operationId); await journal.release(lease)
    for (const patch of [{ siteId: 'other',localSiteId: 104,bindingName: 'SITE_D1_OTHER' },
      { workerGroup: 'group-2',bindingName: 'SITE_D1_OTHER',localSiteId: 104 },
      { workerGroup: 'group-2',siteId: 'other',bindingName: 'SITE_D1_OTHER' }]) {
      await expect(journal.reserve(provisionPlan(input(patch)))).rejects.toThrow('conflict')
    }
    await expect(journal.reserve(provisionPlan(input({ workerGroup: 'group-2',siteId: 'other',localSiteId: 104,ownerUserId: 999 })))).rejects.toThrow('conflict')
  })
  it('enforces group capacity and refuses to adopt existing site records or routes',async () => {
    await db.prepare("INSERT INTO sites VALUES (103,'already-there')").run()
    await expect(journal.preview(provisionPlan(input()))).rejects.toThrow('occupied')
    await expect(journal.reserve(provisionPlan(input()))).rejects.toThrow('conflict')
    await db.prepare('DELETE FROM sites').run()
    for (let index = 0; index < 50; index++) await registerSite(db,{
      siteId: `existing-${index}`,localSiteId: index+1,databaseId: `${String(index).padStart(8,'0')}-1111-4111-8111-111111111111`,
      bindingName: `SITE_D1_${index}`,workerGroup: 'group-1',adminHost: `cms-site-existing-${index}.beginos.org`,
      schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `existing-${index}`,
    })
    await expect(journal.preview(provisionPlan(input()))).rejects.toThrow('group full')
    await expect(journal.reserve(provisionPlan(input()))).rejects.toThrow('conflict')
  })
  it('atomically permits only one owner per operation and at most four live global leases',async () => {
    const plans = Array.from({ length: 6 },(_,index) => provisionPlan(input({ siteId: `site-${index}`,localSiteId: index+100,workerGroup: `group-${index}` })))
    for (const plan of plans) await journal.reserve(plan)
    const same = await Promise.allSettled(Array.from({ length: 12 },() => journal.claim(plans[0].operationId)))
    expect(same.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const others = await Promise.allSettled(plans.slice(1).map(plan => journal.claim(plan.operationId)))
    expect(others.filter(result => result.status === 'fulfilled')).toHaveLength(3)
    const first = same.find(result => result.status === 'fulfilled')
    if (first?.status !== 'fulfilled') throw new Error('Expected one claimant')
    await journal.heartbeat(first.value)
    await journal.release(first.value)
    expect(await journal.claim(plans[0].operationId)).toMatchObject({ epoch: 2 })
    await expect(journal.heartbeat(first.value)).rejects.toThrow('lease lost')
  })
  it('requires explicit reconciliation after an interrupted effect and fences the old executor',async () => {
    const plan = provisionPlan(input()); await journal.reserve(plan)
    const original = await journal.claim(plan.operationId)
    expect(await journal.begin(original,'database',intent('database'))).toBe('new')
    await db.prepare('UPDATE site_provision_operations SET lease_until=0 WHERE operation_id=?').bind(plan.operationId).run()
    await expect(journal.claim(plan.operationId)).rejects.toThrow('reconciliation')
    const recovered = await journal.claim(plan.operationId,{ reconcilePending: true })
    expect(await journal.begin(recovered,'database',intent('database'))).toBe('reconcile')
    await expect(journal.begin(recovered,'database',digest)).rejects.toThrow('intent conflict')
    await expect(journal.finish(original,'database',intent('database'),dbReceipt(plan))).rejects.toThrow('lease lost')
    await expect(journal.heartbeat(original)).rejects.toThrow('lease lost')
    await journal.release(original)
    await journal.heartbeat(recovered)
    await journal.finish(recovered,'database',intent('database'),dbReceipt(plan))
    await journal.finish(recovered,'database',intent('database'),dbReceipt(plan))
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 1,databaseId,pendingStep: null })
  })
  it('keeps receipt/checkpoint atomic on constraint failure and retries a committed response loss',async () => {
    const firstPlan = provisionPlan(input({ siteId: 'taken',localSiteId: 104,workerGroup: 'group-2' }))
    await journal.reserve(firstPlan)
    const first = await journal.claim(firstPlan.operationId)
    await journal.begin(first,'database',intent('database')); await journal.finish(first,'database',intent('database'),dbReceipt(firstPlan))
    const plan = provisionPlan(input()); await journal.reserve(plan)
    const lease = await journal.claim(plan.operationId)
    await journal.begin(lease,'database',intent('database'))
    await expect(journal.finish(lease,'database',intent('database'),dbReceipt(plan))).rejects.toThrow()
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 0,databaseId: null,pendingStep: 1 })
    expect(await db.prepare('SELECT receipt_json FROM site_provision_steps WHERE operation_id=?').bind(plan.operationId).first('receipt_json')).toBeNull()
    const receipt = { ...dbReceipt(plan),databaseId: '40000000-1111-4111-8111-111111111111' }
    let injected = false
    const lost = new Proxy(db,{ get(target,key) {
      if (key === 'prepare') return (sql: string) => {
        const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement,{ get(stmt,method) {
          if (method === 'bind') return (...args: unknown[]) => wrap(stmt.bind(...args))
          if (method === 'run' && sql.startsWith('UPDATE site_provision_steps')) return async () => {
            const result = await stmt.run()
            if (!injected) { injected = true; throw new Error('Injected lost response') }
            return result
          }
          const value = Reflect.get(stmt,method); return typeof value === 'function' ? value.bind(stmt) : value
        } })
        return wrap(target.prepare(sql))
      }
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(new ProvisionJournal(lost,target).finish(lease,'database',intent('database'),receipt)).rejects.toThrow('Injected lost response')
    await journal.finish(lease,'database',intent('database'),receipt)
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 1,databaseId: receipt.databaseId })
    await expect(journal.finish(lease,'database',intent('database'),dbReceipt(plan))).rejects.toThrow('receipt conflict')
  })
  it('requires ordered and matching evidence and verifies the live registration before completing',async () => {
    const plan = provisionPlan(input()); await journal.reserve(plan)
    const lease = await journal.claim(plan.operationId)
    await expect(journal.begin(lease,'deploy',intent('deploy'))).rejects.toThrow('step order')
    const receipts = [dbReceipt(plan),{ databaseId,schemaDigest: digest,schemaVersion: 1,objects: 504 },
      { databaseId,siteId: plan.siteId,localSiteId: 103,tenantId: 1,ownerUserId: 7,contentDigest: digest },
      { deploymentId,versionId: randomUUID(),manifestDigest: digest,commit: 'b'.repeat(40) },
      { deploymentId,reportDigest: digest,checkedAt: new Date().toISOString() },{ siteId: plan.siteId,routingVersion: 2 }]
    for (const [index,step] of provisionSteps.entries()) {
      expect(await journal.begin(lease,step,intent(step))).toBe('new')
      if (step === 'schema') await expect(journal.finish(lease,step,intent(step),{ ...receipts[index],databaseId: randomUUID() })).rejects.toThrow('database mismatch')
      if (step === 'verify') await expect(journal.finish(lease,step,intent(step),{ ...receipts[index],deploymentId: randomUUID() })).rejects.toThrow('deployment mismatch')
      if (step === 'activate') {
        await expect(journal.finish(lease,step,intent(step),receipts[index])).rejects.toThrow('activation not verified')
        await registerSite(db,{ siteId: plan.siteId,localSiteId: 103,databaseId,bindingName: plan.bindingName,workerGroup: plan.workerGroup,
          adminHost: plan.adminHost,schemaVersion: 1,routingVersion: 2,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: plan.operationId })
        await expect(journal.finish(lease,step,intent(step),receipts[index])).rejects.toThrow('activation not verified')
        await db.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind(plan.siteId,'7','manager').run()
      }
      await journal.finish(lease,step,intent(step),receipts[index])
    }
    expect(await journal.read(plan.operationId)).toMatchObject({ checkpoint: 6,pendingStep: null,leaseUntil: 0 })
    await journal.finish(lease,'activate',intent('activate'),receipts[5])
    await expect(journal.claim(plan.operationId)).rejects.toThrow('complete')
    expect(await journal.reserve(plan)).toMatchObject({ checkpoint: 6 })
    expect(await journal.reserve(provisionPlan(input({ siteId: 'next-site',localSiteId: 104,bindingName: 'SITE_D1_NEXT' })))).toMatchObject({ checkpoint: 0 })
  })
  it('rejects mismatched central targets and every operation invoked from a site context',async () => {
    const plan = provisionPlan(input())
    await expect(new ProvisionJournal(db,{ ...target,centralDatabaseId: databaseId }).reserve(plan)).rejects.toThrow('target mismatch')
    await withSiteContext({ siteId: 'site-a',localSiteId: 1,binding: db,routingVersion: 1,currentRoutingVersion: () => 1,identity: null },async () => {
      await expect(journal.preview(plan)).rejects.toThrow('central-only')
      await expect(journal.reserve(plan)).rejects.toThrow('central-only')
      await expect(journal.claim(plan.operationId)).rejects.toThrow('central-only')
      await expect(journal.read(plan.operationId)).rejects.toThrow('central-only')
    })
  })
})
