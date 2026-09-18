// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { migrateSiteControl } from '../../src/site-control/schema'
import { migrateCentralMasters } from '../../src/site-control/masterSchema'
import { migrateDataDeliveries } from '../../src/site-control/dataDeliverySchema'
import { registerSite } from '../../src/site-control/registry'
import { commitMasterRelease } from '../../src/site-control/masterPublisher'
import { masterReference, projectMasterData, type MasterReference } from '../../src/site-control/masterSnapshot'
import { acknowledgeMachineDataDelivery, readDataDelivery, readMachineDataDelivery, recordMachineDeliveryFailure,
  requestDataDelivery } from '../../src/site-control/dataDeliveryJournal'
import { createMachineDataDelivery } from '../../src/site-control/dataDelivery'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let db: D1Database, archive: R2Bucket, reference: MasterReference
const identity = { userId: '7',sessionId: 'session-7' }
const capability = 'a'.repeat(64)
const operation = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12,'0')}`
const input = (id: string) => ({ operationId: id,siteId: 'a',routingVersion: 1,kind: 'master' as const,reference })

describe('durable pinned site data delivery journal',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',
      d1Databases: { CENTRAL: 'data-delivery-journal' },r2Buckets: { ARCHIVE: 'data-delivery-journal-archive' } })
    db = await mf.getD1Database('CENTRAL'); archive = await mf.getR2Bucket('ARCHIVE')
    await db.batch([
      db.prepare('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL,lock_until TEXT)'),
      db.prepare('CREATE TABLE users_sessions(id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)'),
      db.prepare('CREATE TABLE sites(id INTEGER PRIMARY KEY,runtime_site_id TEXT,tenant_id INTEGER)'),
    ])
    await migrateSiteControl(db); await migrateCentralMasters(db); await migrateDataDeliveries(db)
    await db.prepare("INSERT INTO users VALUES(7,'manager@example.invalid',NULL)").run()
    await db.prepare('INSERT INTO users_sessions VALUES(?,?,?)').bind(identity.sessionId,7,new Date(Date.now()+3600000).toISOString()).run()
    await registerSite(db,{ siteId: 'a',localSiteId: 37,databaseId: '00000000-0000-4000-8000-000000000037',bindingName: 'SITE_D1_A',
      workerGroup: 'group-1',adminHost: 'cms-site-a.beginos.org',schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',
      productionEnabled: false,operationId: 'register-a' })
    await db.prepare("INSERT INTO sites VALUES(37,'a',1)").run()
    await db.prepare("INSERT INTO site_runtime_access VALUES('a','7','manager')").run()
    const release = await commitMasterRelease(db,{ format: 1,collection: 'authors',recordId: '100',revision: 1,tenantId: 1,
      sourceUpdatedAt: '2026-09-18T12:00:00.000Z',data: projectMasterData('authors',{ displayName: 'Pinned author',
        gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' }),relations: {} },'journal-master')
    reference = masterReference(release)
  },30000)
  afterAll(async () => { await mf?.dispose() })

  it('admits an exact manager request once, leases it idempotently and records an immutable receipt',async () => {
    const id = operation('1'), request = input(id)
    expect(await requestDataDelivery(db,archive,identity,request,capability)).toMatchObject({ operationId: id,state: 'queued',replayed: false,
      workerGroup: 'group-1',attemptCount: 0,reference })
    expect(await requestDataDelivery(db,archive,identity,request,capability)).toMatchObject({ operationId: id,replayed: true })
    await expect(requestDataDelivery(db,archive,identity,request,'e'.repeat(64))).rejects.toThrow('identity')
    const first = await readMachineDataDelivery(db,archive,id,capability,1_000_000)
    expect(first).toMatchObject({ operationId: id,siteId: 'a',workerGroup: 'group-1',attemptCount: 1,reference,
      value: { root: reference,centralTenantId: 1 } })
    expect((await readMachineDataDelivery(db,archive,id,capability,1_000_001)).attemptCount).toBe(1)
    const receipt = { receivedDigest: reference.digest,receivedAt: '2026-09-18T12:01:00.000Z' }
    expect(await acknowledgeMachineDataDelivery(db,id,capability,receipt,1_000_002)).toMatchObject({ state: 'succeeded',receipt })
    expect(await acknowledgeMachineDataDelivery(db,id,capability,receipt,1_000_003)).toMatchObject({ state: 'succeeded',attemptCount: 1 })
    await expect(db.prepare('DELETE FROM site_data_deliveries WHERE operation_id=?').bind(id).run()).rejects.toThrow('immutable')
    await expect(db.prepare("UPDATE site_data_deliveries SET site_id='forged' WHERE operation_id=?").bind(id).run()).rejects.toThrow('immutable')
  })

  it('fails closed for an unknown capability, stale routing and revoked manager access',async () => {
    const bad = await createMachineDataDelivery(db,archive).readDelivery(operation('1'),'b'.repeat(64))
    expect(bad).toEqual({ ok: false,reason: 'unavailable' })
    const id = operation('2')
    await requestDataDelivery(db,archive,identity,input(id),'b'.repeat(64))
    await db.prepare("UPDATE site_runtime_registry SET routing_version=2 WHERE site_id='a'").run()
    expect(await createMachineDataDelivery(db,archive).readDelivery(id,'b'.repeat(64))).toEqual({ ok: false,reason: 'unavailable' })
    await db.prepare("UPDATE site_runtime_registry SET routing_version=1 WHERE site_id='a'").run()
    await db.prepare("UPDATE site_runtime_access SET role='editor' WHERE site_id='a' AND user_id='7'").run()
    await expect(readDataDelivery(db,identity,id)).rejects.toThrow('manager')
    await expect(requestDataDelivery(db,archive,identity,input(operation('3')),'c'.repeat(64))).rejects.toThrow('manager')
    await db.prepare("UPDATE site_runtime_access SET role='manager' WHERE site_id='a' AND user_id='7'").run()
  })

  it('backs off bounded failures and moves the fifth failed attempt to dead letter state',async () => {
    const id = operation('4'), token = 'd'.repeat(64)
    await requestDataDelivery(db,archive,identity,input(id),token)
    let now = 2_000_000
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await readMachineDataDelivery(db,archive,id,token,now)).attemptCount).toBe(attempt)
      const failed = await recordMachineDeliveryFailure(db,id,token,'receiver_unavailable',now+1)
      expect(failed.state).toBe(attempt === 5 ? 'dead' : 'retry')
      now += 400_000
    }
    const saved = await readDataDelivery(db,identity,id)
    expect(saved).toMatchObject({ state: 'dead',attemptCount: 5,lastErrorCode: 'receiver_unavailable' })
    await expect(readMachineDataDelivery(db,archive,id,token,now)).rejects.toThrow('unavailable')
  })
})
