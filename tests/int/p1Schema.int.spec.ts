// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyP1Schema, roleSchemaDigest, type RoleSchema } from '../../scripts/p1-schema'
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
const schema: RoleSchema = { role: 'central',objects: [
  { name: 'items',type: 'table',sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)' },
  { name: 'items_value',type: 'index',sql: 'CREATE INDEX items_value ON items(value)' },
] }
describe('P1 new database schema bootstrap',() => {
  beforeAll(async () => { mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("ok") } }',
    compatibilityDate: '2025-08-15',d1Databases: ['A','B','C','D','E','F'] }) })
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
  const additions = [
    { name: 'new_operations',type: 'table',sql: 'CREATE TABLE new_operations (id TEXT PRIMARY KEY)' },
    { name: 'site_control_schema_migrations',type: 'table',sql: 'CREATE TABLE site_control_schema_migrations (operation_id TEXT PRIMARY KEY,from_digest TEXT NOT NULL,to_digest TEXT NOT NULL,applied_at TEXT NOT NULL)' },
  ]
  const target = { ...schema,objects: [...schema.objects,...additions] }
  const migration = { fromDigest: roleSchemaDigest(schema.objects),fromOperationId: 'p1-central-schema-v1',addedObjects: additions.map(item => item.name) }
  it('applies only a reviewed additive version and retains data and durable provenance on retry',async () => {
    const db = await mf.getD1Database('D')
    await applyP1Schema(db,schema,'p1-central-schema-v1')
    await db.prepare("INSERT INTO items VALUES (1,'preserved')").run()
    await expect(applyP1Schema(db,target,'p1-central-schema-v2')).rejects.toThrow('operation conflict')
    await expect(applyP1Schema(db,{ ...target,objects: target.objects.filter(item => item.name !== 'items_value') },'p1-central-schema-v2',migration)).rejects.toThrow('Invalid reviewed')
    expect(await applyP1Schema(db,target,'p1-central-schema-v2',migration)).toMatchObject({ created: 2,upgradedFrom: migration.fromDigest })
    expect((await applyP1Schema(db,target,'p1-central-schema-v2',migration)).created).toBe(0)
    expect(await db.prepare('SELECT value FROM items WHERE id=1').first('value')).toBe('preserved')
    expect(await db.prepare('SELECT from_digest FROM site_control_schema_migrations').first('from_digest')).toBe(migration.fromDigest)
    await expect(applyP1Schema(db,schema,'p1-central-schema-v1')).rejects.toThrow('operation conflict')
  })
  it('rolls back additive DDL when the migration transaction fails and resumes after a lost response',async () => {
    const db = await mf.getD1Database('E')
    await applyP1Schema(db,schema,'p1-central-schema-v1')
    const injected = (lostResponse: boolean) => new Proxy(db,{ get(target,key) {
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        const result = await target.batch(lostResponse ? statements : [...statements,target.prepare('SELECT * FROM injected_missing_table')])
        if (lostResponse) throw new Error('Injected lost response')
        return result
      }
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(applyP1Schema(injected(false),target,'p1-central-schema-v2',migration)).rejects.toThrow('injected_missing_table')
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name='new_operations'").first()).toBeNull()
    expect(await db.prepare('SELECT digest FROM p1_schema_bootstrap').first('digest')).toBe(migration.fromDigest)
    await expect(applyP1Schema(injected(true),target,'p1-central-schema-v2',migration)).rejects.toThrow('Injected lost response')
    expect((await applyP1Schema(db,target,'p1-central-schema-v2',migration)).created).toBe(0)
  })
  it('rejects drift in the existing schema before adding objects',async () => {
    const db = await mf.getD1Database('F')
    await applyP1Schema(db,schema,'p1-central-schema-v1')
    await db.prepare('DROP INDEX items_value').run()
    await expect(applyP1Schema(db,target,'p1-central-schema-v2',migration)).rejects.toThrow('source schema drift')
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name='new_operations'").first()).toBeNull()
  })
})
