// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import type { SitePrincipal } from '../../src/site-control/sso'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
let contexts: SiteContext[]
const principal = (siteId: string): SitePrincipal => ({ siteId, localSiteId: siteId === 'a' ? 37 : 82, userId: '7', displayName: 'Live name', role: 'viewer', routingVersion: 1 })

describe('credential-free local identity projection synchronization', () => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { A: 'projection-a', B: 'projection-b' } })
    contexts = await Promise.all(['A','B'].map(async (name, i) => {
      const binding = await mf.getD1Database(name)
      await binding.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, central_user_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
      await binding.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').bind(i ? 19 : 7, '7', `Stored ${name}`, '2000-01-01', '2000-01-01').run()
      return { siteId: name.toLowerCase(), localSiteId: i ? 82 : 37, binding, routingVersion: 1, currentRoutingVersion: () => 1, identity: null }
    }))
  }, 30000)
  afterAll(async () => { await mf?.dispose() })

  it('preserves local IDs and creation times while allowlisting fields from a live identity', async () => {
    const projected = await Promise.all(contexts.map(context => withSiteContext(context, () => syncSiteIdentityProjection({
      ...principal(context.siteId), password: 'must-not-copy', hash: 'must-not-copy', roles: ['super-admin'], sessionId: 'must-not-copy',
    } as SitePrincipal))))
    expect(projected.map(user => user.id)).toEqual([7, 19])
    expect(projected.every(user => Object.keys(user).sort().join(',') === 'centralUserId,displayName,id')).toBe(true)
    for (const context of contexts) {
      const stored = await context.binding.prepare('SELECT * FROM users').first<{ created_at: string; updated_at: string; display_name: string }>()
      expect(stored?.created_at).toBe('2000-01-01')
      expect(stored?.display_name).toBe('Live name')
      await withSiteContext(context, () => syncSiteIdentityProjection(principal(context.siteId)))
      expect((await context.binding.prepare('SELECT updated_at FROM users').first<{ updated_at: string }>())?.updated_at).toBe(stored?.updated_at)
    }
  })

  it('creates one local identity under concurrent first use independently in each site', async () => {
    await Promise.all(contexts.map(context => withSiteContext(context, async () => {
      const identities = await Promise.all(Array.from({ length: 10 }, () => syncSiteIdentityProjection({ ...principal(context.siteId), userId: '8' })))
      expect(new Set(identities.map(user => user.id)).size).toBe(1)
      expect((await context.binding.prepare("SELECT COUNT(*) AS n FROM users WHERE central_user_id = '8'").first<{ n: number }>())?.n).toBe(1)
    })))
  })

  it('refuses missing context, another site and stale routing before writing', async () => {
    await expect(syncSiteIdentityProjection(principal('a'))).rejects.toThrow('context required')
    await withSiteContext(contexts[0], async () => {
      await expect(syncSiteIdentityProjection(principal('b'))).rejects.toThrow('Invalid')
      await expect(syncSiteIdentityProjection({ ...principal('a'), routingVersion: 2 })).rejects.toThrow('Invalid')
      await expect(syncSiteIdentityProjection({ ...principal('a'), localSiteId: 82 })).rejects.toThrow('Invalid')
      await expect(syncSiteIdentityProjection({ ...principal('a'), userId: '8 OR 1=1' })).rejects.toThrow('Invalid')
    })
  })
})
