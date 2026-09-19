// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { migrateSiteControl } from '../../src/site-control/schema'
import { centralSiteDirectory, listGrantedSites, type SiteDirectoryPage } from '../../src/site-control/siteDirectory'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
let db: D1Database
const identity = { userId: '7', sessionId: 'central-session-seven' }
const other = { userId: '8', sessionId: 'central-session-eight' }
const url = 'https://agenthub.beginos.org/auth/sites'

describe('central granted site directory on native D1', () => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { CENTRAL: 'site-directory-test' } })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([
      db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY,email TEXT,lock_until TEXT)'),
      db.prepare('CREATE TABLE users_sessions (id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)'),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,name TEXT,runtime_site_id TEXT UNIQUE)'),
    ])
    await migrateSiteControl(db)
    await db.batch([
      db.prepare('INSERT INTO users VALUES (7,?,NULL),(8,?,NULL)').bind('seven@example.invalid','eight@example.invalid'),
      db.prepare('INSERT INTO users_sessions VALUES (?,7,?),(?,8,?)').bind(identity.sessionId,new Date(Date.now()+3600000).toISOString(),other.sessionId,new Date(Date.now()+3600000).toISOString()),
    ])
    const inserts = []
    for (let i = 1; i <= 56; i++) {
      const siteId = `s${String(i).padStart(3,'0')}`
      inserts.push(db.prepare('INSERT INTO site_runtime_registry VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(siteId,i,
        `${String(i).padStart(8,'0')}-1111-4111-8111-111111111111`,`SITE_D1_${i}`,'group-1',`cms-site-${siteId}.beginos.org`,1,1,
        i === 3 ? 'paused' : i === 4 ? 'migrating' : 'active','UTC',0,`provision-${siteId}`))
      inserts.push(db.prepare('INSERT INTO sites VALUES (?,?,?)').bind(i,i === 2 ? '第二站 🌿' : `Site ${siteId}`,siteId))
      inserts.push(db.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind(siteId,i === 56 ? '8' : '7',i === 3 ? 'viewer' : 'editor'))
    }
    await db.batch(inserts)
  },60000)
  afterAll(async () => { await mf?.dispose() })

  it('paginates only explicit grants and exposes no database or session metadata', async () => {
    const first = await listGrantedSites(db,identity)
    expect(first.sites).toHaveLength(50)
    expect(first.nextCursor).toBe('s050')
    expect(Object.keys(first.sites[0]).sort()).toEqual(['name','role','routingVersion','siteId','state'])
    expect(first.sites.find(site => site.siteId === 's003')).toMatchObject({ state: 'paused',role: 'viewer' })
    expect(first.sites.find(site => site.siteId === 's004')).toMatchObject({ state: 'migrating' })
    const second = await listGrantedSites(db,identity,'',first.nextCursor!)
    expect(second.sites.map(site => site.siteId)).toEqual(['s051','s052','s053','s054','s055'])
    expect(second.nextCursor).toBeNull()
    expect((await listGrantedSites(db,other)).sites.map(site => site.siteId)).toEqual(['s056'])
  })
  it('searches names and stable IDs literally with Unicode and SQL punctuation', async () => {
    expect((await listGrantedSites(db,identity,'第二')).sites.map(site => site.siteId)).toEqual(['s002'])
    expect((await listGrantedSites(db,identity,'S012')).sites.map(site => site.siteId)).toEqual(['s012'])
    expect((await listGrantedSites(db,identity,"%' OR 1=1 --")).sites).toEqual([])
    expect((await listGrantedSites(db,identity,'s056')).sites).toEqual([])
  })
  it('uses private central HTTP and rejects caller-selected identities and malformed cursors', async () => {
    const options = { database: db, authenticate: async () => identity }
    const response = await centralSiteDirectory(new Request(url),options)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.json() as SiteDirectoryPage).sites).toHaveLength(50)
    for (const query of ['?userId=8','?after=invalid/value','?q=a&q=b',`?q=${'x'.repeat(121)}`]) {
      expect((await centralSiteDirectory(new Request(url+query),options)).status).toBe(400)
    }
    expect((await centralSiteDirectory(new Request('https://evil.example/auth/sites',{ headers: { 'x-forwarded-host': 'agenthub.beginos.org' } }),options)).status).toBe(404)
    expect((await centralSiteDirectory(new Request(url,{ method: 'POST' }),options)).status).toBe(405)
    expect((await centralSiteDirectory(new Request(url),{ ...options,authenticate: async () => null })).status).toBe(401)
  })
  it('removes revoked grants immediately and denies locked, expired or revoked sessions', async () => {
    await db.prepare('DELETE FROM site_runtime_access WHERE site_id = ? AND user_id = ?').bind('s001','7').run()
    expect((await listGrantedSites(db,identity,'s001')).sites).toEqual([])
    await db.prepare('UPDATE users SET lock_until = ? WHERE id = 7').bind(new Date(Date.now()+60000).toISOString()).run()
    await expect(listGrantedSites(db,identity)).rejects.toThrow('Central login required')
    await db.prepare('UPDATE users SET lock_until = NULL WHERE id = 7').run()
    await db.prepare('UPDATE users_sessions SET expires_at = ? WHERE id = ?').bind(new Date(Date.now()-1000).toISOString(),identity.sessionId).run()
    await expect(listGrantedSites(db,identity)).rejects.toThrow('Central login required')
    await db.prepare('DELETE FROM users_sessions WHERE id = ?').bind(other.sessionId).run()
    expect((await centralSiteDirectory(new Request(url),{ database: db,authenticate: async () => other })).status).toBe(401)
  })
})
