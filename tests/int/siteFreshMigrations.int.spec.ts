// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
import { migrations } from '../../src/migrations'

const wranglerRequire = createRequire(realpathSync(resolve('node_modules/wrangler/package.json')))
const adapterRequire = createRequire(realpathSync(resolve('node_modules/@payloadcms/db-d1-sqlite/package.json')))
const { Miniflare } = wranglerRequire('miniflare')
const { drizzle } = adapterRequire('drizzle-orm/d1')

it('applies every registered schema migration in dependency order to a fresh native D1', async () => {
  const files = readdirSync(resolve('src/migrations')).filter(name => /^\d.*\.ts$/.test(name)).map(name => name.slice(0, -3))
  expect([...migrations.map(m => m.name)].sort()).toEqual(files.sort())
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
    compatibilityDate: '2025-08-15', d1Databases: ['DB'] })
  try {
    const binding = await mf.getD1Database('DB') as D1Database
    // This test covers schema replay only. An empty tenant/profile inventory
    // deliberately leaves tenant-specific content seeds to deployed acceptance.
    const payload = { find: vi.fn(async ({ collection }: { collection: string }) => {
      expect(['tenants', 'pipeline-profiles']).toContain(collection)
      return { docs: [], hasNextPage: false, totalDocs: 0 }
    }), logger: { warn: vi.fn(), info: vi.fn() } }
    for (const migration of migrations) {
      try {
        await migration.up({ db: drizzle(binding), payload, req: {} } as unknown as MigrateUpArgs)
      } catch (cause) { throw new Error(`Fresh D1 migration failed: ${migration.name}`, { cause }) }
    }
    const columns = await binding.prepare("PRAGMA table_info('keyword_batch_presets')").all<{ name: string }>()
    expect(columns.results.map(c => c.name)).toContain('geo_intent_whitelist')
    const foreignKeys = await binding.prepare('PRAGMA foreign_key_check').all()
    expect(foreignKeys.results).toEqual([])
  } finally { await mf.dispose() }
}, 120000)
