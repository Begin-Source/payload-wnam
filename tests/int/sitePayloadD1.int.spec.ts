// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildConfig, getPayload, type Payload, type PayloadRequest } from 'payload'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { createSiteD1Proxy } from '../../src/site-runtime/d1'
import { guardSanitizedSiteConfig } from '../../src/site-runtime/payloadPlugin'

const require = createRequire(realpathSync(resolve('node_modules/wrangler/package.json')))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
let payload: Payload
let contexts: SiteContext[]
const config = buildConfig({
  secret: 'isolated-payload-site-test-only',
  telemetry: false,
  typescript: { autoGenerate: false },
  admin: { disable: true, importMap: { autoGenerate: false } },
  db: sqliteD1Adapter({ binding: createSiteD1Proxy(), push: false, allowIDOnCreate: true }),
  globals: [{ slug: 'admin-branding', fields: [{ name: 'title', type: 'text' }] }],
  collections: [{
    slug: 'categories', timestamps: false, lockDocuments: false,
    fields: [{ name: 'name', type: 'text', required: true }, { name: 'slug', type: 'text', required: true }, { name: 'locale', type: 'text', required: true }],
  }],
}).then(guardSanitizedSiteConfig)

describe('one Payload instance with request-bound native D1 clients', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { A: 'payload-site-a', B: 'payload-site-b' },
    })
    contexts = await Promise.all(['A', 'B'].map(async siteId => {
      const binding = await mf.getD1Database(siteId)
      await binding.exec('CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, locale TEXT NOT NULL)')
      await binding.exec('CREATE TABLE payload_preferences (id INTEGER PRIMARY KEY, key TEXT NOT NULL)')
      return { siteId, binding, routingVersion: 1, currentRoutingVersion: () => 1, identity: null }
    }))
    // Initialization outside all site contexts must not query or seed a default database.
    payload = await getPayload({ config, key: 'site-d1-isolation' })
  }, 30000)
  afterAll(async () => { await mf?.dispose() })

  it('initializes without a default binding and refuses context-free reads', async () => {
    expect(payload.config.collections.find(c => c.slug === 'payload-preferences')?.hooks.beforeOperation.length).toBeGreaterThan(0)
    expect(payload.config.globals.find(g => g.slug === 'admin-branding')?.hooks.beforeOperation?.length).toBeGreaterThan(0)
    expect(await getPayload({ config, key: 'site-d1-isolation' })).toBe(payload)
    await expect(payload.find({ collection: 'categories' })).rejects.toThrow()
    await expect(payload.findGlobal({ slug: 'admin-branding' })).rejects.toThrow('Site database context required')
  })

  it('creates identical IDs, finds, updates and deletes through the real adapter', async () => {
    await Promise.all(contexts.map(context => withSiteContext(context, async () => {
      await payload.create({ collection: 'categories', data: { id: 1, name: context.siteId, slug: 'same', locale: 'en' } })
      const first = await payload.findByID({ collection: 'categories', id: 1 })
      expect(first.name).toBe(context.siteId)
      await payload.update({ collection: 'categories', id: 1, data: { name: `${context.siteId}-updated` } })
    })))
    await Promise.all(Array.from({ length: 40 }, (_, i) => {
      const context = contexts[i % 2]
      return withSiteContext(context, async () => {
        const result = await payload.find({ collection: 'categories', where: { id: { equals: 1 } } })
        expect(result.docs.map(row => row.name)).toEqual([`${context.siteId}-updated`])
      })
    }))
    await withSiteContext(contexts[0], () => payload.delete({ collection: 'categories', id: 1 }))
    await withSiteContext(contexts[1], async () => {
      expect((await payload.findByID({ collection: 'categories', id: 1 })).name).toBe('B-updated')
    })
  }, 30000)

  it('rejects a reused request and transplanted DataLoader before serving cached data', async () => {
    const req: Partial<PayloadRequest> = {}
    await withSiteContext(contexts[1], () => payload.findByID({ collection: 'categories', id: 1, req }))
    await withSiteContext(contexts[0], async () => {
      await expect(payload.findByID({ collection: 'categories', id: 1, req })).rejects.toThrow('Cross-context Payload')
      await expect(payload.findByID({ collection: 'categories', id: 1, req: { payloadDataLoader: req.payloadDataLoader } })).rejects.toThrow('Cross-context Payload')
    })
  })
})
