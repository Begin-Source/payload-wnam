// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import { migrateSiteControl } from '../../src/site-control/schema'
import { provisionAdmissionSchema } from '../../src/site-control/provisionAdmissionSchema'
import { provisionDispatchSchema } from '../../src/site-control/provisionDispatchSchema'
import { submitProvisionAdmission,cancelProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { enqueueProvisionDispatch,observeProvisionBuild,triggerProvisionBuild,
  type ProvisionDispatchEnvironment,type ProvisionQueueMessage } from '../../src/site-control/provisionDispatch'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> },db: D1Database
const actor = { userId: '7',sessionId: 'central-session' }
const account = 'd487cf34c606620b442632a72272014d',subscription = 'subscription-fixture-1234'
const sent: ProvisionQueueMessage[] = []
const queue = { send: vi.fn(async (body: ProvisionQueueMessage) => { sent.push(body) }) } as unknown as Queue<ProvisionQueueMessage>
const env = (): ProvisionDispatchEnvironment => ({ CENTRAL_D1: db,PROVISION_DISPATCH_QUEUE: queue,
  PROVISION_DEPLOY_HOOK_URL: 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/fixture-hook-123456',
  PROVISION_BUILD_ACCOUNT_ID: account,PROVISION_BUILD_EVENT_SUBSCRIPTION_ID: subscription,
  PROVISION_BUILD_WORKER: 'payload-wnam',PROVISION_BUILD_BRANCH: 'feat/site-per-d1',
  PROVISION_BUILD_REPOSITORY: 'payload-wnam',PROVISION_BUILD_REPOSITORY_OWNER: 'Begin-Source' })
const input = (siteId: string) => ({ requestId: randomUUID(),siteId,name: `Site ${siteId}`,tenantId: 1,ownerUserId: 8,timezone: 'UTC' })
const buildEvent = (buildUuid: string,name: 'started' | 'failed' | 'canceled' | 'succeeded') => ({
  type: `cf.workersBuilds.worker.build.${name}`,
  source: { type: 'workersBuilds.worker',workerName: 'payload-wnam' },
  payload: { buildUuid,status: name === 'started' ? 'running' : name === 'succeeded' ? 'success' : name,
    buildOutcome: name === 'started' ? null : name === 'succeeded' ? 'success' : name === 'failed' ? 'failure' : 'canceled',
    buildTriggerMetadata: { buildTriggerSource: 'deploy_hook',branch: 'feat/site-per-d1',commitHash: 'a'.repeat(40),
      repoName: 'payload-wnam',providerAccountName: 'Begin-Source',providerType: 'github' } },
  metadata: { accountId: account,eventSubscriptionId: subscription,eventSchemaVersion: 1,eventTimestamp: new Date().toISOString() },
})

describe('durable provision build dispatch on native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
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
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    sent.length = 0; vi.mocked(queue.send).mockClear()
    await db.batch(['site_provision_build_events','site_provision_dispatches','site_provision_requests','site_provision_steps',
      'site_provision_operations','sites','users_sessions','users_roles','users_tenants','users','tenants']
      .map(table => db.prepare(`DELETE FROM ${table}`)))
    await db.batch([
      db.prepare("INSERT INTO users VALUES (7,'manager@example.invalid',NULL),(8,'owner@example.invalid',NULL)"),
      db.prepare("INSERT INTO users_sessions VALUES ('central-session',7,'2099-01-01')"),
      db.prepare("INSERT INTO users_roles VALUES (7,'general-manager'),(8,'site-manager')"),
      db.prepare('INSERT INTO users_tenants VALUES (7,1),(8,1)'),db.prepare("INSERT INTO tenants VALUES (1,'Tenant')"),
    ])
  })

  it('creates the outbox atomically and cancels only an unclaimed dispatch',async () => {
    const request = input('dispatch-cancel')
    await submitProvisionAdmission(db,actor,request)
    expect(await db.prepare('SELECT request_id AS requestId,input_digest AS inputDigest,state,branch FROM site_provision_dispatches')
      .first()).toMatchObject({ requestId: request.requestId,state: 'queued',branch: 'ops/site-provision' })
    await cancelProvisionAdmission(db,actor,request.requestId)
    expect(await db.prepare('SELECT state,completed_at AS completedAt FROM site_provision_dispatches WHERE request_id=?')
      .bind(request.requestId).first()).toMatchObject({ state: 'cancelled',completedAt: expect.any(String) })
  })

  it('posts one Hook for duplicate queue delivery and stores the exact build UUID',async () => {
    const request = input('dispatch-once'),buildUuid = randomUUID()
    await submitProvisionAdmission(db,actor,request)
    const message = await enqueueProvisionDispatch(db,queue)
    expect(message).toMatchObject({ type: 'site.provision.dispatch',requestId: request.requestId })
    const fetcher = vi.fn(async () => Response.json({ success: true,result: { build_uuid: buildUuid,branch: 'feat/site-per-d1',worker: 'payload-wnam' } }))
    const results = await Promise.all(Array.from({ length: 8 },() => triggerProvisionBuild(db,message!,env().PROVISION_DEPLOY_HOOK_URL,fetcher)))
    expect(fetcher).toHaveBeenCalledOnce()
    expect(results.filter(result => result.triggered)).toHaveLength(1)
    expect(await db.prepare('SELECT state,build_uuid AS buildUuid,attempt_count AS attemptCount FROM site_provision_dispatches WHERE request_id=?')
      .bind(request.requestId).first()).toEqual({ state: 'dispatched',buildUuid,attemptCount: 1 })
  })

  it('never repeats an ambiguous Hook POST and attaches the exact later build event',async () => {
    const request = input('dispatch-unknown'),buildUuid = randomUUID()
    await submitProvisionAdmission(db,actor,request)
    const message = await enqueueProvisionDispatch(db,queue)
    const fetcher = vi.fn(async () => { throw new Error('response lost') })
    await triggerProvisionBuild(db,message!,env().PROVISION_DEPLOY_HOOK_URL,fetcher)
    await triggerProvisionBuild(db,message!,env().PROVISION_DEPLOY_HOOK_URL,fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(await db.prepare('SELECT state,build_uuid AS buildUuid FROM site_provision_dispatches WHERE request_id=?')
      .bind(request.requestId).first()).toEqual({ state: 'triggering_unknown',buildUuid: null })
    await expect(cancelProvisionAdmission(db,actor,request.requestId)).rejects.toMatchObject({ status: 409 })
    await submitProvisionAdmission(db,actor,input('dispatch-waits'))
    expect(await enqueueProvisionDispatch(db,queue)).toBeNull()
    expect(await observeProvisionBuild(db,buildEvent(buildUuid,'started'),env())).toMatchObject({ requestId: request.requestId,state: 'running' })
    expect(await db.prepare('SELECT state,build_uuid AS buildUuid FROM site_provision_dispatches WHERE request_id=?')
      .bind(request.requestId).first()).toEqual({ state: 'running',buildUuid })
  })

  it('rejects unrelated events, records retries idempotently and waits for the six-step receipt',async () => {
    const request = input('dispatch-events'),buildUuid = randomUUID()
    await submitProvisionAdmission(db,actor,request)
    const message = await enqueueProvisionDispatch(db,queue)
    await triggerProvisionBuild(db,message!,env().PROVISION_DEPLOY_HOOK_URL,
      async () => Response.json({ success: true,result: { build_uuid: buildUuid } }))
    const started = buildEvent(buildUuid,'started')
    await observeProvisionBuild(db,started,env())
    expect(await observeProvisionBuild(db,started,env())).toMatchObject({ event: 'started',replayed: true })
    const forged = buildEvent(buildUuid,'failed'); forged.payload.buildTriggerMetadata.buildTriggerSource = 'push_event'
    await expect(observeProvisionBuild(db,forged,env())).rejects.toThrow('source mismatch')
    expect(await observeProvisionBuild(db,buildEvent(buildUuid,'succeeded'),env())).toMatchObject({ state: 'needs_review' })
    await db.prepare(`UPDATE site_provision_requests SET prepared_request_json='{}',prepared_plan_json='{}',prepared_plan_digest='${'b'.repeat(64)}',
      prepared_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE request_id=?`).bind(request.requestId).run()
    await db.prepare(`INSERT INTO site_provision_operations
      (operation_id,site_id,local_site_id,worker_group,binding_name,database_name,plan_json,plan_digest,created_at)
      SELECT request_id,site_id,local_site_id,'p1-group-1','SITE_D1_TEST','dispatch-test-db',prepared_plan_json,prepared_plan_digest,
        strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM site_provision_requests WHERE request_id=?`).bind(request.requestId).run()
    expect(await db.prepare('SELECT state FROM site_provision_dispatches WHERE request_id=?').bind(request.requestId).first('state')).toBe('running')
    await db.prepare(`UPDATE site_provision_operations SET completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE operation_id=?`)
      .bind(request.requestId).run()
    expect(await db.prepare('SELECT state,build_outcome AS outcome FROM site_provision_dispatches WHERE request_id=?')
      .bind(request.requestId).first()).toEqual({ state: 'succeeded',outcome: 'success' })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_build_events').first('n')).toBe(2)
  })
})
