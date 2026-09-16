// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { migrateSiteControl } from '../../src/site-control/schema'
import { crossSiteReference, readSiteRegistration, registerSite, transitionSiteState, type SiteRegistration } from '../../src/site-control/registry'
import { payloadSessionAuthority } from '../../src/site-control/payloadSessionAuthority'
import { SiteLoginBroker } from '../../src/site-control/sso'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
let database: D1Database
let broker: SiteLoginBroker
let now: number
const clock = () => now
const identity = { userId: '7', sessionId: 'central-session-7' }
const registration = (siteId = 'a'): SiteRegistration => ({ siteId,
  databaseId: siteId === 'a' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
  bindingName: `SITE_D1_${siteId.toUpperCase()}`, workerGroup: 'group-1', adminHost: `cms-site-${siteId}.beginos.org`,
  schemaVersion: 1, routingVersion: 1, migrationState: 'active', timezone: 'UTC', productionEnabled: false, operationId: `provision-${siteId}`,
})

describe('central registry and single-use SSO on native D1', () => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { CENTRAL: 'site-control-test' } })
    database = await mf.getD1Database('CENTRAL')
    // Exact relevant columns of the existing central Payload session schema.
    await database.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, lock_until TEXT)')
    await database.exec('CREATE TABLE users_sessions (id TEXT PRIMARY KEY, _parent_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL)')
    await migrateSiteControl(database)
    await migrateSiteControl(database)
  }, 30000)
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    now = Date.parse('2026-09-16T12:00:00Z')
    for (const table of ['site_login_sessions','site_login_tickets','site_runtime_access','site_runtime_registry','users_sessions','users']) {
      await database.prepare(`DELETE FROM ${table}`).run()
    }
    await database.prepare('INSERT INTO users (id,email) VALUES (?,?)').bind(7, 'staff@example.invalid').run()
    for (const site of ['a','b']) {
      await registerSite(database, registration(site))
      await database.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind(site, '7', 'editor').run()
    }
    await database.prepare('INSERT INTO users_sessions VALUES (?,?,?)').bind(identity.sessionId, 7, new Date(now + 3600_000).toISOString()).run()
    broker = new SiteLoginBroker(database, payloadSessionAuthority(database, clock), clock)
  })

  it('registers idempotently, rejects repointing and makes routing changes compare-and-swap', async () => {
    await registerSite(database, registration())
    await expect(registerSite(database, { ...registration(), databaseId: '33333333-3333-4333-8333-333333333333' })).rejects.toThrow('conflicts')
    expect((await readSiteRegistration(database, 'a'))?.databaseId).toBe(registration().databaseId)
    const changes = await Promise.allSettled([transitionSiteState(database, 'a', 1, 'paused'), transitionSiteState(database, 'a', 1, 'migrating')])
    expect(changes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await readSiteRegistration(database, 'a'))?.routingVersion).toBe(2)
    expect(crossSiteReference('a', 'articles', 1)).not.toEqual(crossSiteReference('b', 'articles', 1))
  })

  it('allows exactly one of 20 concurrent exchanges and stores digests, never bearer tokens', async () => {
    const ticket = await broker.issueTicket('a', identity)
    expect(ticket.expiresAt - now).toBe(60_000)
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)))
    const success = attempts.filter(result => result.status === 'fulfilled')
    expect(success).toHaveLength(1)
    if (success[0].status !== 'fulfilled') throw new Error('No winner')
    const session = success[0].value
    expect(session.cookie).toMatch(/^__Host-site-session=[a-f0-9]{64}; Path=\//)
    expect(session.cookie).toContain('Secure; HttpOnly; SameSite=Strict')
    expect(session.cookie).not.toContain('Domain=')
    expect(await broker.authenticate(session.session, 'a', registration().adminHost)).toMatchObject({ siteId: 'a', userId: '7', role: 'editor' })
    const persisted = JSON.stringify(await database.prepare('SELECT * FROM site_login_tickets').all()) + JSON.stringify(await database.prepare('SELECT * FROM site_login_sessions').all())
    expect(persisted).not.toContain(ticket.ticket)
    expect(persisted).not.toContain(session.session)
    expect((await database.prepare('SELECT COUNT(*) AS n FROM site_login_sessions').first<{ n: number }>())?.n).toBe(1)
  }, 30000)

  it('binds tickets and sessions to site and host, expires at 60 seconds, and rejects stale routes', async () => {
    const ticket = await broker.issueTicket('a', identity)
    await expect(broker.redeemTicket(ticket.ticket, 'b', registration('b').adminHost)).rejects.toThrow()
    await expect(broker.redeemTicket(ticket.ticket, 'a', 'attacker.example')).rejects.toThrow()
    const session = await broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)
    await expect(broker.authenticate(session.session, 'b', registration('b').adminHost)).rejects.toThrow()
    await expect(broker.authenticate(session.session, 'a', 'public.example')).rejects.toThrow()
    const expired = await broker.issueTicket('a', identity)
    now += 60_000
    await expect(broker.redeemTicket(expired.ticket, 'a', registration().adminHost)).rejects.toThrow('expired')
    const stale = await broker.issueTicket('a', identity)
    await transitionSiteState(database, 'a', 1, 'paused')
    await transitionSiteState(database, 'a', 2, 'active')
    await expect(broker.redeemTicket(stale.ticket, 'a', registration().adminHost)).rejects.toThrow('routing')
    await expect(broker.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('routing')
  })

  it('reads grants every time and revokes existing sessions immediately', async () => {
    const ticket = await broker.issueTicket('a', identity)
    const session = await broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)
    await database.prepare("UPDATE site_runtime_access SET role = 'viewer' WHERE site_id = 'a'").run()
    expect((await broker.authenticate(session.session, 'a', registration().adminHost)).role).toBe('viewer')
    const pending = await broker.issueTicket('a', identity)
    await database.prepare("DELETE FROM site_runtime_access WHERE site_id = 'a'").run()
    await expect(broker.redeemTicket(pending.ticket, 'a', registration().adminHost)).rejects.toThrow('denied')
    await expect(broker.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('denied')
    await expect(broker.issueTicket('a', identity)).rejects.toThrow('denied')
  })

  it('checks central logout, locking, expiry and authority availability on each request', async () => {
    const ticket = await broker.issueTicket('a', identity)
    const session = await broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)
    const down = new SiteLoginBroker(database, async () => { throw new Error('Central unavailable') }, clock)
    await expect(down.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('Central unavailable')
    await database.prepare('UPDATE users SET lock_until = ?').bind(new Date(now + 60_000).toISOString()).run()
    await expect(broker.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('denied')
    await database.prepare('UPDATE users SET lock_until = NULL').run()
    await database.prepare('DELETE FROM users_sessions').run()
    await expect(broker.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('denied')
  })

  it('rolls ticket consumption back if session insertion fails', async () => {
    const ticket = await broker.issueTicket('a', identity)
    await database.exec("CREATE TRIGGER reject_session BEFORE INSERT ON site_login_sessions BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END")
    await expect(broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)).rejects.toThrow()
    await database.exec('DROP TRIGGER reject_session')
    const session = await broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)
    await broker.revokeSession(session.session)
    await expect(broker.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('invalid')
  })

  it('never lets a ticket or site session outlive the original central session', async () => {
    await database.prepare('UPDATE users_sessions SET expires_at = ?').bind(new Date(now + 30_000).toISOString()).run()
    const ticket = await broker.issueTicket('a', identity)
    expect(ticket.expiresAt).toBe(now + 30_000)
    const session = await broker.redeemTicket(ticket.ticket, 'a', registration().adminHost)
    expect(session.expiresAt).toBe(now + 30_000)
    now += 30_000
    await expect(broker.authenticate(session.session, 'a', registration().adminHost)).rejects.toThrow('expired')
    expect(await payloadSessionAuthority(database, clock)(identity.userId, identity.sessionId)).toBeNull()
  })

  it('removes grants on central user deletion so a reused numeric ID cannot inherit them', async () => {
    await database.prepare('DELETE FROM users_sessions').run()
    await database.prepare('DELETE FROM users').run()
    await database.prepare('INSERT INTO users (id,email) VALUES (?,?)').bind(7, 'replacement@example.invalid').run()
    await database.prepare('INSERT INTO users_sessions VALUES (?,?,?)').bind(identity.sessionId, 7, new Date(now + 3600_000).toISOString()).run()
    await expect(broker.issueTicket('a', identity)).rejects.toThrow('denied')
  })
})
