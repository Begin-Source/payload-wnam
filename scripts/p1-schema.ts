import { createHash } from 'node:crypto'

export type RoleSchema = { role: string; objects: { name: string; type: string; sql: string }[] }
const receiptName = 'p1_schema_bootstrap'
const receiptSQL = `CREATE TABLE p1_schema_bootstrap (
  id INTEGER PRIMARY KEY CHECK(id=1), role TEXT NOT NULL, digest TEXT NOT NULL,
  operation_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, completed_at TEXT
)`
const canonical = (sql: string) => sql.trim().replace(/;$/, '')
const inventory = (database: D1Database) => database.prepare(`SELECT name,type,sql FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name`)
  .all<{ name: string; type: string; sql: string }>()

/** Only initializes a new, explicitly allowlisted P1 database. This is not a
 * fleet migration: a changed schema or unknown existing object requires a new,
 * reviewed migration. A partially completed matching operation can resume. */
export async function applyP1Schema(database: D1Database, schema: RoleSchema, operationId: string) {
  if (!['central','site-a','site-b'].includes(schema.role) || !schema.objects.length || !/^p1-[a-z-]+-schema-v1$/.test(operationId)) throw new Error('Invalid P1 schema operation')
  const expected = new Map<string, RoleSchema['objects'][number]>()
  for (const item of schema.objects) {
    if (!['table','index','trigger'].includes(item.type) || !/^CREATE\s+(TABLE|UNIQUE INDEX|INDEX|TRIGGER)\s/i.test(item.sql) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item.name) || item.name === receiptName || expected.has(item.name)) throw new Error('Invalid role schema object')
    expected.set(item.name,item)
  }
  const digest = createHash('sha256').update(JSON.stringify([...expected.values()].sort((a,b) => a.name.localeCompare(b.name)))).digest('hex')
  let existing = (await inventory(database)).results
  const storedReceipt = existing.find(item => item.name === receiptName)
  if (!storedReceipt) {
    if (existing.length) throw new Error('Refusing to bootstrap an unowned database')
    await database.batch([database.prepare(receiptSQL),database.prepare(`INSERT INTO p1_schema_bootstrap
      (id,role,digest,operation_id,created_at) VALUES (1,?,?,?,?)`).bind(schema.role,digest,operationId,new Date().toISOString())])
    existing = (await inventory(database)).results
  } else if (canonical(storedReceipt.sql) !== canonical(receiptSQL)) throw new Error('P1 bootstrap receipt schema drift')
  const receipt = await database.prepare('SELECT role,digest,operation_id,completed FROM p1_schema_bootstrap WHERE id=1')
    .first<{ role: string; digest: string; operation_id: string; completed: number }>()
  if (!receipt || receipt.role !== schema.role || receipt.digest !== digest || receipt.operation_id !== operationId) throw new Error('P1 bootstrap operation conflict')
  for (const item of existing) {
    if (item.name === receiptName) continue
    const target = expected.get(item.name)
    if (!target || item.type !== target.type || canonical(item.sql) !== canonical(target.sql)) throw new Error(`P1 schema drift: ${item.name}`)
  }
  const names = new Set(existing.map(item => item.name))
  const missing = schema.objects.filter(item => !names.has(item.name))
  if (receipt.completed && missing.length) throw new Error('Completed P1 schema has missing objects')
  // CREATEs are transactional in each batch. A failed batch leaves no partial
  // subset of that batch; completed earlier batches remain resumable.
  for (let offset = 0; offset < missing.length; offset += 20) {
    await database.batch(missing.slice(offset,offset + 20).map(item => database.prepare(item.sql)))
  }
  const verified = (await inventory(database)).results.filter(item => item.name !== receiptName)
  if (verified.length !== expected.size || verified.some(item => canonical(item.sql) !== canonical(expected.get(item.name)?.sql ?? ''))) throw new Error('P1 schema verification failed')
  await database.prepare('UPDATE p1_schema_bootstrap SET completed=1,completed_at=COALESCE(completed_at,?) WHERE id=1 AND digest=?')
    .bind(new Date().toISOString(),digest).run()
  return { role: schema.role,operationId,digest,objects: expected.size,created: missing.length }
}
