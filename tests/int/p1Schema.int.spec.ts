// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyP1Schema, type RoleSchema } from '../../scripts/p1-schema'
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
const schema: RoleSchema = { role: 'central',objects: [
  { name: 'items',type: 'table',sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)' },
  { name: 'items_value',type: 'index',sql: 'CREATE INDEX items_value ON items(value)' },
] }
describe('P1 new database schema bootstrap',() => {
  beforeAll(async () => { mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("ok") } }',
    compatibilityDate: '2025-08-15',d1Databases: ['A','B','C'] }) })
  afterAll(async () => { await mf?.dispose() })
  it('retries without replacing data, rejects changed schemas and detects drift',async () => {
    const db = await mf.getD1Database('A')
    expect((await applyP1Schema(db,schema,'p1-central-schema-v1')).created).toBe(2)
    await db.prepare("INSERT INTO items VALUES (1,'preserved')").run()
    expect((await applyP1Schema(db,schema,'p1-central-schema-v1')).created).toBe(0)
    expect(await db.prepare('SELECT value FROM items WHERE id=1').first('value')).toBe('preserved')
    await expect(applyP1Schema(db,{ ...schema,objects: schema.objects.slice(0,1) },'p1-central-schema-v1')).rejects.toThrow('operation conflict')
    await db.prepare('DROP INDEX items_value').run()
    await expect(applyP1Schema(db,schema,'p1-central-schema-v1')).rejects.toThrow('missing objects')
  })
  it('refuses unowned databases and resumes a transactionally interrupted bootstrap',async () => {
    const foreign = await mf.getD1Database('B')
    await foreign.prepare('CREATE TABLE existing_data (id INTEGER)').run()
    await expect(applyP1Schema(foreign,schema,'p1-central-schema-v1')).rejects.toThrow('unowned database')
    const db = await mf.getD1Database('C')
    let batches = 0
    const interrupted = new Proxy(db,{ get(target,key) {
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        if (++batches === 2) throw new Error('Injected interruption')
        return target.batch(statements)
      }
      const value = Reflect.get(target,key)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(applyP1Schema(interrupted,schema,'p1-central-schema-v1')).rejects.toThrow('Injected interruption')
    expect((await applyP1Schema(db,schema,'p1-central-schema-v1')).created).toBe(2)
  })
})
