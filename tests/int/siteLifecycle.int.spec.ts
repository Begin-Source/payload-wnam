// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { changeSiteLifecycle, getManagedSite, type SiteLifecycleInput } from '../../src/site-control/siteLifecycle'
import { centralSiteManagement } from '../../src/site-control/siteManagementHttp'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }, db: D1Database
const identity = { userId: '7',sessionId: 'original-central-session' }
const input = (overrides: Partial<SiteLifecycleInput> = {}): SiteLifecycleInput => ({ siteId: 'a',action: 'pause',expectedRoutingVersion: 1,operationId: crypto.randomUUID(),...overrides })
const origin = 'https://p1-hub.beginos.org'

describe('manager site lifecycle on native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("ok") } }',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([
      db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY,email TEXT,lock_until TEXT)'),
      db.prepare('CREATE TABLE users_sessions (id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)'),
    ])
    await migrateSiteControl(db)
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    await db.batch(['site_lifecycle_operations','site_login_tickets','site_login_sessions','site_runtime_access','site_runtime_registry','users_sessions','users'].map(name => db.prepare(`DELETE FROM ${name}`)))
    await db.batch([
      db.prepare("INSERT INTO users VALUES (7,'seven@example.invalid',NULL),(8,'eight@example.invalid',NULL)"),
      db.prepare('INSERT INTO users_sessions VALUES (?,7,?),(?,8,?)').bind(identity.sessionId,new Date(Date.now()+3600000).toISOString(),'session-eight',new Date(Date.now()+3600000).toISOString()),
    ])
    for (const [index,siteId] of ['a','b'].entries()) await registerSite(db,{ siteId,localSiteId: index+1,
      databaseId: `${index+1}0000000-1111-4111-8111-111111111111`,bindingName: `SITE_D1_${siteId.toUpperCase()}`,workerGroup: 'group-1',
      adminHost: `cms-site-${siteId}.beginos.org`,schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `provision-${siteId}` })
    await db.prepare("INSERT INTO site_runtime_access VALUES ('a','7','manager'),('b','7','editor'),('a','8','manager')").run()
  })

  it('commits one transition for simultaneous retries and preserves the other site',async () => {
    await db.prepare("INSERT INTO site_login_sessions VALUES ('a-cookie','a','7',?,'cms-site-a.beginos.org',1,?),('b-cookie','b','7',?,'cms-site-b.beginos.org',1,?)")
      .bind(identity.sessionId,Date.now()+60000,identity.sessionId,Date.now()+60000).run()
    await db.prepare("INSERT INTO site_login_tickets VALUES ('a-ticket','a','7',?,'cms-site-a.beginos.org',1,?,NULL)")
      .bind(identity.sessionId,Date.now()+60000).run()
    const operation = input(), results = await Promise.all(Array.from({ length: 10 },() => changeSiteLifecycle(db,identity,operation)))
    expect(results.filter(result => !result.replayed)).toHaveLength(1)
    expect(results.every(result => result.routingVersion === 2)).toBe(true)
    expect(await db.prepare('SELECT COUNT(*) FROM site_lifecycle_operations').first('COUNT(*)')).toBe(1)
    expect(await getManagedSite(db,identity,'a')).toMatchObject({ state: 'paused',routingVersion: 2,productionEnabled: false })
    expect(await getManagedSite(db,identity,'b')).toMatchObject({ state: 'active',routingVersion: 1 })
    expect((await db.prepare('SELECT site_id FROM site_login_sessions').all()).results).toEqual([{ site_id: 'b' }])
    expect(await db.prepare('SELECT COUNT(*) FROM site_login_tickets').first('COUNT(*)')).toBe(0)
    await changeSiteLifecycle(db,identity,input({ action: 'resume',expectedRoutingVersion: 2 }))
    expect(await changeSiteLifecycle(db,identity,operation)).toMatchObject({ routingVersion: 2,replayed: true })
    expect(await getManagedSite(db,identity,'a')).toMatchObject({ state: 'active',routingVersion: 3 })
  })
  it('allows only one competing operation and refuses stale, no-op or repurposed operation IDs',async () => {
    const first = input(), second = input()
    const outcomes = await Promise.allSettled([first,second].map(operation => changeSiteLifecycle(db,identity,operation)))
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const winner = outcomes[0].status === 'fulfilled' ? first : second
    for (const operation of [input(),input({ expectedRoutingVersion: 2 }),{ ...winner,action: 'resume' as const,expectedRoutingVersion: 2 }]) {
      await expect(changeSiteLifecycle(db,identity,operation)).rejects.toMatchObject({ status: 409 })
    }
    await expect(changeSiteLifecycle(db,{ userId: '8',sessionId: 'session-eight' },winner)).rejects.toMatchObject({ status: 409 })
    await db.prepare("UPDATE site_runtime_access SET role='manager' WHERE site_id='b' AND user_id='7'").run()
    await expect(changeSiteLifecycle(db,identity,{ ...winner,siteId: 'b' })).rejects.toMatchObject({ status: 409 })
    expect(await getManagedSite(db,identity,'b')).toMatchObject({ routingVersion: 1,state: 'active' })
  })
  it('requires an explicit site manager even for a receipt retry and rejects migrating or retired sites',async () => {
    const operation = input()
    await changeSiteLifecycle(db,identity,operation)
    for (const role of ['viewer','editor','publisher']) {
      await db.prepare("UPDATE site_runtime_access SET role=? WHERE site_id='a' AND user_id='7'").bind(role).run()
      await expect(changeSiteLifecycle(db,identity,operation)).rejects.toMatchObject({ status: 403 })
    }
    await expect(changeSiteLifecycle(db,identity,input({ siteId: 'missing' }))).rejects.toMatchObject({ status: 403 })
    await db.prepare("UPDATE site_runtime_access SET role='manager' WHERE site_id='a' AND user_id='7'").run()
    for (const state of ['provisioning','migrating','retired']) {
      await db.prepare("UPDATE site_runtime_registry SET migration_state=? WHERE site_id='a'").bind(state).run()
      await expect(changeSiteLifecycle(db,identity,input({ action: 'resume',expectedRoutingVersion: 2 }))).rejects.toMatchObject({ status: 409 })
    }
  })
  it('rechecks permission and session inside the mutation after an asynchronous precheck',async () => {
    const injected = (sql: string) => new Proxy(db,{ get(target,key) {
      if (key === 'prepare') return (statement: string) => {
        const prepared = target.prepare(statement)
        if (!statement.startsWith('INSERT INTO site_lifecycle_operations')) return prepared
        return { bind: (...args: unknown[]) => ({ first: async () => { await db.prepare(sql).run(); return prepared.bind(...args).first() } }) }
      }
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(changeSiteLifecycle(injected("DELETE FROM site_runtime_access WHERE site_id='a' AND user_id='7'"),identity,input())).rejects.toMatchObject({ status: 403 })
    await db.prepare("INSERT INTO site_runtime_access VALUES ('a','7','manager')").run()
    await expect(changeSiteLifecycle(injected("UPDATE users_sessions SET expires_at='2000-01-01' WHERE _parent_id=7"),identity,input())).rejects.toMatchObject({ status: 401 })
    expect(await db.prepare("SELECT routing_version FROM site_runtime_registry WHERE site_id='a'").first('routing_version')).toBe(1)
    expect(await db.prepare('SELECT COUNT(*) FROM site_lifecycle_operations').first('COUNT(*)')).toBe(0)
  })
  it('rolls back the receipt if the route update fails, then safely retries',async () => {
    const operation = input()
    await db.prepare("CREATE TRIGGER injected_failure BEFORE UPDATE ON site_runtime_registry BEGIN SELECT RAISE(ABORT,'Injected failure'); END").run()
    try { await expect(changeSiteLifecycle(db,identity,operation)).rejects.toThrow('Injected failure') }
    finally { await db.prepare('DROP TRIGGER injected_failure').run() }
    expect(await db.prepare('SELECT COUNT(*) FROM site_lifecycle_operations').first('COUNT(*)')).toBe(0)
    expect(await changeSiteLifecycle(db,identity,operation)).toMatchObject({ routingVersion: 2,replayed: false })
  })
  it('rejects expired, locked, missing and malformed sessions',async () => {
    await expect(changeSiteLifecycle(db,{ ...identity,sessionId: 'forged' },input())).rejects.toMatchObject({ status: 401 })
    for (const value of [new Date(Date.now()+60000).toISOString(),'not-a-date']) {
      await db.prepare('UPDATE users SET lock_until=? WHERE id=7').bind(value).run()
      await expect(changeSiteLifecycle(db,identity,input())).rejects.toMatchObject({ status: 401 })
    }
  })
  it('validates exact target and private HTTP origin, methods, input size and fields',async () => {
    const options = { database: db,centralOrigin: origin,authenticate: async () => identity }
    const request = (body: unknown,headers = { origin,'content-type': 'application/json' }) => new Request(`${origin}/auth/site-lifecycle`,{ method: 'POST',headers,body: JSON.stringify(body) })
    for (const value of [{},input({ siteId: '' }),input({ expectedRoutingVersion: 0 }),input({ expectedRoutingVersion: 1.5 }),
      input({ operationId: 'short' }),{ ...input(),userId: '8' },{ ...input(),siteId: 'x'.repeat(2048) }]) {
      expect((await centralSiteManagement(request(value),options)).status).toBe(400)
    }
    expect((await centralSiteManagement(request(input(),{ origin: 'https://evil.example','content-type': 'application/json' }),options)).status).toBe(403)
    expect((await centralSiteManagement(request(input(),{ origin: 'null','content-type': 'application/json' }),options)).status).toBe(403)
    expect((await centralSiteManagement(request(input()),{ ...options,authenticate: async () => null })).status).toBe(401)
    for (const query of ['', '?siteId=a&siteId=b','?siteId=a&userId=8']) expect((await centralSiteManagement(new Request(`${origin}/auth/site${query}`),options)).status).toBe(400)
    expect((await centralSiteManagement(new Request(`${origin}/auth/site?siteId=b`),options)).status).toBe(200)
    expect((await centralSiteManagement(new Request(`${origin}/auth/site-lifecycle`),options)).status).toBe(405)
    expect((await centralSiteManagement(new Request('https://evil.example/auth/site?siteId=a',{ headers: { 'x-forwarded-host': 'p1-hub.beginos.org' } }),options)).status).toBe(404)
    const response = await centralSiteManagement(request(input()),options)
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
