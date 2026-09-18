// @vitest-environment node
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { migrateCentralMasters,migrateSiteMasters } from '../../src/site-control/masterSchema'
import { migrateSiteConfigs } from '../../src/site-control/configSchema'
import { migrateSiteAssets } from '../../src/site-control/assetSchema'
import { commitMasterRelease,exportMasterBundle } from '../../src/site-control/masterPublisher'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { masterReference,masterDigest,projectMasterData,canonicalMasterJSON } from '../../src/site-control/masterSnapshot'
import { dataDeliveryQueueMessage } from '../../src/site-control/dataDeliveryQueue'
import { siteDataDeliveryQueue } from '../../src/site-runtime/dataDeliveryConsumer'
import type { SiteEnvironment } from '../../src/application-roles/siteEnvironment'
import type { DataDeliverySummary,MachineDataDelivery } from '../../src/site-control/dataDeliveryJournal'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let central: D1Database,site: D1Database,archive: R2Bucket,sitePublic: R2Bucket,sitePrivate: R2Bucket
let delivery: MachineDataDelivery
const capability = 'a'.repeat(64),operationId = '10000000-0000-4000-8000-000000000001'

function queueMessage(body: unknown,attempts=1) {
  return { id: crypto.randomUUID(),timestamp: new Date(),body,attempts,ack: vi.fn(),retry: vi.fn() }
}

describe('site data delivery Queue consumer',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',
      d1Databases: { CENTRAL: 'delivery-queue-central',SITE: 'delivery-queue-site' },
      r2Buckets: { ARCHIVE: 'delivery-queue-archive',PUBLIC: 'delivery-queue-public',PRIVATE: 'delivery-queue-private' } })
    central = await mf.getD1Database('CENTRAL'); site = await mf.getD1Database('SITE')
    archive = await mf.getR2Bucket('ARCHIVE'); sitePublic = await mf.getR2Bucket('PUBLIC'); sitePrivate = await mf.getR2Bucket('PRIVATE')
    await central.prepare('CREATE TABLE sites(id INTEGER PRIMARY KEY,runtime_site_id TEXT,tenant_id INTEGER)').run()
    await migrateSiteControl(central)
    await registerSite(central,{ siteId: 'a',localSiteId: 37,databaseId: '00000000-0000-4000-8000-000000000037',bindingName: 'SITE_D1_A',
      workerGroup: 'group-1',adminHost: 'cms-site-a.beginos.org',schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',
      productionEnabled: false,operationId: 'register-a' })
    await central.prepare("INSERT INTO sites VALUES(37,'a',1)").run()
    await migrateCentralMasters(central)
    const release = await commitMasterRelease(central,{ format: 1,collection: 'authors',recordId: '100',revision: 1,tenantId: 1,
      sourceUpdatedAt: '2026-09-18T13:00:00.000Z',data: projectMasterData('authors',{ displayName: 'Queued author',
        gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' }),relations: {} },'queued-author')
    const reference = masterReference(release),value = await exportMasterBundle(central,'a',1,reference)
    const referenceDigest = await masterDigest(canonicalMasterJSON(reference))
    delivery = { operationId,siteId: 'a',workerGroup: 'group-1',routingVersion: 1,kind: 'master',reference,referenceDigest,value,attemptCount: 1 }
    await site.batch([
      site.prepare('CREATE TABLE tenants(id INTEGER PRIMARY KEY,central_source_record_id TEXT)'),
      site.prepare('CREATE TABLE sites(id INTEGER PRIMARY KEY,tenant_id INTEGER)'),
      site.prepare(`CREATE TABLE media(id INTEGER PRIMARY KEY,filename TEXT,central_source_record_id TEXT,central_source_revision INTEGER)`),
      site.prepare("INSERT INTO tenants VALUES(1,'1')"),site.prepare('INSERT INTO sites VALUES(37,1)'),
    ])
    await migrateSiteMasters(site); await migrateSiteConfigs(site); await migrateSiteAssets(site)
  },30000)
  afterAll(async () => { await mf?.dispose() })

  it('writes the exact candidate, survives a lost acknowledgement response and finishes without a second read',async () => {
    const summary = { operationId,siteId: 'a',actorUserId: '7',workerGroup: 'group-1',routingVersion: 1,kind: 'master',
      reference: delivery.reference,state: 'queued',attemptCount: 0,createdAt: '2026-09-18T13:00:00.000Z',updatedAt: '2026-09-18T13:00:00.000Z',
      completedAt: null,lastErrorCode: null,receipt: null } satisfies DataDeliverySummary
    const body = await dataDeliveryQueueMessage(summary,capability)
    const readDelivery = vi.fn(async () => ({ ok: true as const,value: delivery }))
    const acknowledgeDelivery = vi.fn()
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce({ ok: true as const,value: { ...summary,state: 'succeeded' as const,
        receipt: { receivedDigest: delivery.referenceDigest,receivedAt: '2026-09-18T13:01:00.000Z' } } })
    const failDelivery = vi.fn(async () => ({ ok: true as const,value: { ...summary,state: 'retry' as const } }))
    const route = { siteId: 'a',localSiteId: 37,databaseId: '00000000-0000-4000-8000-000000000037',bindingName: 'SITE_D1_A',
      workerGroup: 'group-1',adminHost: 'cms-site-a.beginos.org',schemaVersion: 1,routingVersion: 1,migrationState: 'active' as const }
    const env = { CENTRAL_ORIGIN: 'https://p1-hub.beginos.org',PAYLOAD_SECRET: 'queue-test-secret-that-is-long-enough',WORKER_GROUP: 'group-1',
      SITE_ROUTES: JSON.stringify([{ siteId: 'a',localSiteId: 37,databaseId: route.databaseId,bindingName: 'SITE_D1_A',schemaVersion: 1 }]),
      SITE_D1_A: site,SITE_PUBLIC: sitePublic,SITE_PRIVATE: sitePrivate,ROUTING: { resolve: vi.fn(async () => route) },
      IDENTITY: { authenticate: vi.fn(),redeem: vi.fn(),logout: vi.fn() },DATA: { readMaster: vi.fn(),readConfig: vi.fn(),readAsset: vi.fn(),
        readDelivery,acknowledgeDelivery,failDelivery } } as unknown as SiteEnvironment
    const first = queueMessage(body)
    await siteDataDeliveryQueue({ queue: 'payload-wnam-p1-data-group-1',messages: [first] } as unknown as MessageBatch<unknown>,env)
    expect(first.retry).toHaveBeenCalledOnce(); expect(first.ack).not.toHaveBeenCalled()
    expect(await site.prepare('SELECT digest FROM site_master_releases WHERE collection=? AND record_id=? AND revision=1')
      .bind('authors','100').first('digest')).toBe((delivery.reference as { digest: string }).digest)
    const second = queueMessage(body,2)
    await siteDataDeliveryQueue({ queue: 'payload-wnam-p1-data-group-1',messages: [second] } as unknown as MessageBatch<unknown>,env)
    expect(second.ack).toHaveBeenCalledOnce(); expect(second.retry).not.toHaveBeenCalled()
    expect(readDelivery).toHaveBeenCalledOnce()
    expect(failDelivery).toHaveBeenCalledOnce()
    expect(acknowledgeDelivery).toHaveBeenCalledTimes(2)
  })

  it('rejects a changed group or reference before touching the site database',async () => {
    const summary = { operationId: '10000000-0000-4000-8000-000000000002',siteId: 'a',actorUserId: '7',workerGroup: 'other-group',
      routingVersion: 1,kind: 'master',reference: delivery.reference,state: 'queued',attemptCount: 0,createdAt: '2026-09-18T13:00:00.000Z',
      updatedAt: '2026-09-18T13:00:00.000Z',completedAt: null,lastErrorCode: null,receipt: null } satisfies DataDeliverySummary
    const body = await dataDeliveryQueueMessage(summary,'b'.repeat(64)),message = queueMessage(body)
    const env = { CENTRAL_ORIGIN: 'https://p1-hub.beginos.org',PAYLOAD_SECRET: 'queue-test-secret-that-is-long-enough',WORKER_GROUP: 'group-1',
      SITE_ROUTES: JSON.stringify([{ siteId: 'a',localSiteId: 37,databaseId: '00000000-0000-4000-8000-000000000037',bindingName: 'SITE_D1_A',schemaVersion: 1 }]),
      SITE_D1_A: site,SITE_PUBLIC: sitePublic,SITE_PRIVATE: sitePrivate,ROUTING: { resolve: vi.fn() },
      IDENTITY: { authenticate: vi.fn(),redeem: vi.fn(),logout: vi.fn() },DATA: { readMaster: vi.fn(),readConfig: vi.fn(),readAsset: vi.fn(),
        readDelivery: vi.fn(),acknowledgeDelivery: vi.fn(),failDelivery: vi.fn() } } as unknown as SiteEnvironment
    await siteDataDeliveryQueue({ queue: 'payload-wnam-p1-data-group-1',messages: [message] } as unknown as MessageBatch<unknown>,env)
    expect(message.retry).toHaveBeenCalledOnce(); expect(env.DATA.readDelivery).not.toHaveBeenCalled(); expect(env.ROUTING.resolve).not.toHaveBeenCalled()
  })
})
