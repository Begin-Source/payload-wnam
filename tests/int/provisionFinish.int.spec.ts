// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionPlan } from '../../src/site-control/provisionPlan'
import { registerSite, readSiteRegistration } from '../../src/site-control/registry'
import { migrateSiteControl } from '../../src/site-control/schema'
import { finishProvisionedSite, type GroupDeployment } from '../../scripts/site-operations/finish'
import { inspectProvisionedSite } from '../../src/site-runtime/provisionInspection'
import type { SiteEnvironment } from '../../src/application-roles/siteEnvironment'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const accountId = 'd487cf34c606620b442632a72272014d',centralDatabaseId = randomUUID(),digest = 'c'.repeat(64),commit = 'd'.repeat(40)
const noop = async () => {}
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> },db: D1Database,journal: ProvisionJournal,index = 0
async function fixture() {
  const n = ++index,databaseId = randomUUID()
  const plan = provisionPlan({ operationId: randomUUID(),accountId,centralDatabaseId,centralOrigin: 'https://p1-hub.beginos.org',siteId: `finish-${n}`,
    localSiteId: n,name: `Finish ${n}`,tenantId: 1,ownerUserId: 7,workerGroup: `group-${n}`,workerName: 'payload-wnam-p1-sites',workerTag: 'a'.repeat(32),
    expectedDeploymentId: randomUUID(),baselineManifestDigest: 'b'.repeat(64),bindingName: 'SITE_D1_NEW',schemaVersion: 1,schemaDigest: digest,timezone: 'UTC' })
  await journal.reserve(plan)
  const lease = await journal.claim(plan.operationId)
  for (const [step,receipt] of [
    ['database',{ databaseId,databaseName: plan.databaseName,readReplication: 'disabled' }],
    ['schema',{ databaseId,schemaDigest: digest,schemaVersion: 1,objects: 1 }],
    ['seed',{ databaseId,siteId: plan.siteId,localSiteId: n,tenantId: 1,ownerUserId: 7,contentDigest: digest }],
  ] as const) { await journal.begin(lease,step,digest); await journal.finish(lease,step,digest,receipt) }
  await journal.release(lease)
  await registerSite(db,{ siteId: plan.siteId,localSiteId: n,databaseId,bindingName: plan.bindingName,workerGroup: plan.workerGroup,
    adminHost: plan.adminHost,schemaVersion: 1,routingVersion: 1,migrationState: 'provisioning',timezone: 'UTC',productionEnabled: false,operationId: plan.operationId })
  await db.prepare("INSERT INTO site_runtime_access VALUES (?,'7','manager')").bind(plan.siteId).run()
  let current: (GroupDeployment & { operationId: string }) | null = null,uploads = 0,checks = 0
  const deps = { journal,centralDatabase: db,manifestDigest: digest,preflight: noop,currentDeployment: async () => current,
    deploy: async (guard: () => Promise<void>) => { await guard(); uploads++; current = { deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest: digest,commit,operationId: plan.operationId } },
    verify: async () => { checks++; return { bindingRead: true } },acceptance: noop }
  return { plan,databaseId,deps,counts: () => ({ uploads,checks }),replace: () => { if (current) current = { ...current,deploymentId: randomUUID() } } }
}
describe('durable deployment reconciliation and activation with native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL','SITE'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)'),db.prepare('INSERT INTO users VALUES (7)'),
      db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),db.prepare('INSERT INTO tenants VALUES (1)'),db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT)')])
    await migrateSiteControl(db); journal = new ProvisionJournal(db,{ accountId,centralDatabaseId })
  })
  afterAll(async () => { await mf?.dispose() })
  it('previews without effects, reconciles a lost upload receipt and completes the same operation once',async () => {
    const f = await fixture(),before = await journal.read(f.plan.operationId)
    expect(await finishProvisionedSite(f.plan,'dry-run',f.deps)).toMatchObject({ checkpoint: 3,mutations: false })
    expect(await journal.read(f.plan.operationId)).toEqual(before); expect(f.counts().uploads).toBe(0)
    await expect(finishProvisionedSite(f.plan,'apply',{ ...f.deps,afterDeploy: async () => { throw new Error('Injected lost upload result') } })).rejects.toThrow('Injected lost upload')
    expect(await journal.read(f.plan.operationId)).toMatchObject({ checkpoint: 3,pendingStep: 4,leaseUntil: 0 })
    expect(await finishProvisionedSite(f.plan,'apply',f.deps)).toMatchObject({ checkpoint: 6,complete: true,routingVersion: 2 })
    expect(f.counts().uploads).toBe(1)
    const receipts = (await db.prepare('SELECT * FROM site_provision_steps WHERE operation_id=? ORDER BY step').bind(f.plan.operationId).all()).results
    expect(await finishProvisionedSite(f.plan,'apply',f.deps)).toMatchObject({ complete: true,mutations: false })
    expect((await db.prepare('SELECT * FROM site_provision_steps WHERE operation_id=? ORDER BY step').bind(f.plan.operationId).all()).results).toEqual(receipts)
  })
  it('never replays an unknown upload whose deployed provenance cannot be found',async () => {
    const f = await fixture(); let attempts = 0
    const deps = { ...f.deps,deploy: async () => { attempts++; throw new Error('Unknown upload') } }
    await expect(finishProvisionedSite(f.plan,'apply',deps)).rejects.toThrow('Unknown upload')
    await expect(finishProvisionedSite(f.plan,'apply',deps)).rejects.toThrow('upload was not replayed')
    expect(attempts).toBe(1); expect((await readSiteRegistration(db,f.plan.siteId))?.migrationState).toBe('provisioning')
  })
  it('leaves failed verification inactive and rejects a different deployment on resume',async () => {
    const f = await fixture()
    await expect(finishProvisionedSite(f.plan,'apply',{ ...f.deps,verify: async () => { throw new Error('Wrong binding') } })).rejects.toThrow('Wrong binding')
    expect(await journal.read(f.plan.operationId)).toMatchObject({ checkpoint: 4,pendingStep: 5 })
    expect((await readSiteRegistration(db,f.plan.siteId))?.migrationState).toBe('provisioning')
    f.replace()
    await expect(finishProvisionedSite(f.plan,'apply',f.deps)).rejects.toThrow('changed since receipt')
    expect(f.counts().uploads).toBe(1)
  })
  it('returns failed acceptance to provisioning, invalidates sessions and recovers without uploading again',async () => {
    const f = await fixture()
    await expect(finishProvisionedSite(f.plan,'apply',{ ...f.deps,acceptance: async () => {
      await db.prepare("INSERT INTO site_login_sessions VALUES ('test',?,'7','test',?,2,9999999999999)").bind(f.plan.siteId,f.plan.adminHost).run()
      throw new Error('Injected browser failure')
    } })).rejects.toThrow('Injected browser failure')
    expect(await journal.read(f.plan.operationId)).toMatchObject({ checkpoint: 5,pendingStep: 6,leaseUntil: 0 })
    expect(await readSiteRegistration(db,f.plan.siteId)).toMatchObject({ migrationState: 'provisioning',routingVersion: 3,productionEnabled: false })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_login_sessions WHERE site_id=?').bind(f.plan.siteId).first('n')).toBe(0)
    expect(await finishProvisionedSite(f.plan,'apply',f.deps)).toMatchObject({ complete: true,routingVersion: 4 })
    expect(f.counts().uploads).toBe(1)
  })
  it('does not overwrite a human pause made while acceptance is running',async () => {
    const f = await fixture()
    await expect(finishProvisionedSite(f.plan,'apply',{ ...f.deps,acceptance: async () => {
      await db.prepare("UPDATE site_runtime_registry SET migration_state='paused',routing_version=3 WHERE site_id=?").bind(f.plan.siteId).run()
      throw new Error('Human pause')
    } })).rejects.toThrow('route changed or lease lost')
    expect(await readSiteRegistration(db,f.plan.siteId)).toMatchObject({ migrationState: 'paused',routingVersion: 3 })
    await expect(finishProvisionedSite(f.plan,'apply',f.deps)).rejects.toThrow('activation state changed')
  })
  it('preserves a successor session when the lease changes after the final activation heartbeat',async () => {
    const f = await fixture(),successor = randomUUID()
    let intercepted = false
    const database = new Proxy(db,{
      get(target,key) {
        if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
          if (!intercepted) {
            intercepted = true
            await db.batch([
              db.prepare('UPDATE site_provision_operations SET lease_owner=?,lease_epoch=lease_epoch+1 WHERE operation_id=?').bind(successor,f.plan.operationId),
              db.prepare("UPDATE site_runtime_registry SET migration_state='active',routing_version=2 WHERE site_id=?").bind(f.plan.siteId),
              db.prepare("INSERT INTO site_login_sessions VALUES (?,?,'7','test',?,2,9999999999999)").bind(successor,f.plan.siteId,f.plan.adminHost),
              db.prepare("INSERT INTO site_login_tickets VALUES (?,?,'7','test',?,2,9999999999999,NULL)").bind(successor,f.plan.siteId,f.plan.adminHost),
            ])
          }
          return target.batch(statements)
        }
        const value = Reflect.get(target,key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await expect(finishProvisionedSite(f.plan,'apply',{ ...f.deps,centralDatabase: database })).rejects.toThrow('route changed or lease lost')
    expect(intercepted).toBe(true)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_login_sessions WHERE site_id=?').bind(f.plan.siteId).first('n')).toBe(1)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_login_tickets WHERE site_id=?').bind(f.plan.siteId).first('n')).toBe(1)
    expect(await db.prepare('SELECT lease_owner FROM site_provision_operations WHERE operation_id=?').bind(f.plan.operationId).first('lease_owner')).toBe(successor)
    expect(await readSiteRegistration(db,f.plan.siteId)).toMatchObject({ migrationState: 'active',routingVersion: 2 })
  })
  it('inspects the selected native binding and denies forged targets, ownership and stale registry mappings',async () => {
    const f = await fixture(),local = await mf.getD1Database('SITE')
    await local.batch([local.prepare('CREATE TABLE site_schema_bootstrap (id INTEGER PRIMARY KEY,operation_id TEXT,site_id TEXT,database_id TEXT,digest TEXT,schema_version INTEGER,completed INTEGER)'),
      local.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,slug TEXT,tenant_id INTEGER)'),local.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY,central_source_record_id TEXT)'),
      local.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY,central_user_id TEXT)'),
      local.prepare('INSERT INTO site_schema_bootstrap VALUES (1,?,?,?,?,1,1)').bind(f.plan.operationId,f.plan.siteId,f.databaseId,digest),
      local.prepare('INSERT INTO sites VALUES (?,?,1)').bind(f.plan.localSiteId,f.plan.siteId),local.prepare("INSERT INTO tenants VALUES (1,'1')"),local.prepare("INSERT INTO users VALUES (1,'7')")])
    const external = async () => { throw new Error('External capability invoked') },bucket = () => ({ get: external,put: external })
    const env = { PAYLOAD_SECRET: 'x'.repeat(32),CENTRAL_ORIGIN: f.plan.centralOrigin,WORKER_GROUP: f.plan.workerGroup,
      SITE_ROUTES: JSON.stringify([{ siteId: f.plan.siteId,localSiteId: f.plan.localSiteId,bindingName: f.plan.bindingName,databaseId: f.databaseId,schemaVersion: 1 }]),
      PROVISION_OPERATION: f.plan.operationId,PROVISION_COMMIT: commit,SITE_D1_NEW: local,
      ROUTING: { resolve: () => readSiteRegistration(db,f.plan.siteId) },IDENTITY: { authenticate: external,redeem: external,logout: external },
      DATA: { readMaster: external,readConfig: external,readAsset: external },SITE_PUBLIC: bucket(),SITE_PRIVATE: bucket() } as unknown as SiteEnvironment
    expect(await inspectProvisionedSite(env,f.plan.siteId,f.plan.operationId)).toMatchObject({ databaseId: f.databaseId,localSiteId: f.plan.localSiteId,ownerUserId: '7',state: 'provisioning',releaseCommit: commit })
    await expect(inspectProvisionedSite(env,'foreign',f.plan.operationId)).rejects.toThrow('not bound')
    await expect(inspectProvisionedSite(env,f.plan.siteId,randomUUID())).rejects.toThrow('provenance mismatch')
    await db.prepare('UPDATE site_runtime_registry SET database_id=? WHERE site_id=?').bind(randomUUID(),f.plan.siteId).run()
    await expect(inspectProvisionedSite(env,f.plan.siteId,f.plan.operationId)).rejects.toThrow('routing mismatch')
  })
})
