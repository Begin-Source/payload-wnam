import { createHash } from 'node:crypto'

export type RoleSchema = { role: string; objects: { name: string; type: string; sql: string }[] }
export type ReviewedAdditiveMigration = { fromDigest: string; fromOperationId: string; addedObjects: readonly string[] }
const receiptName = 'p1_schema_bootstrap'
const receiptSQL = `CREATE TABLE p1_schema_bootstrap (
  id INTEGER PRIMARY KEY CHECK(id=1), role TEXT NOT NULL, digest TEXT NOT NULL,
  operation_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, completed_at TEXT
)`
const canonical = (sql: string) => sql.trim().replace(/;$/, '')
export const roleSchemaDigest = (objects: RoleSchema['objects']) => createHash('sha256')
  .update(JSON.stringify([...objects].sort((a,b) => a.name.localeCompare(b.name)))).digest('hex')
const inventory = (database: D1Database) => database.prepare(`SELECT name,type,sql FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name`)
  .all<{ name: string; type: string; sql: string }>()

/** Only initializes a new, explicitly allowlisted P1 database. This is not a
 * fleet migration: a changed schema or unknown existing object requires a new,
 * reviewed migration. A partially completed matching operation can resume. */
export async function applyP1Schema(database: D1Database, schema: RoleSchema, operationId: string, migration?: ReviewedAdditiveMigration) {
  if (!['central','site-a','site-b'].includes(schema.role) || !schema.objects.length || !/^p1-[a-z-]+-schema-v[1-9][0-9]*$/.test(operationId)) throw new Error('Invalid P1 schema operation')
  const expected = new Map<string, RoleSchema['objects'][number]>()
  for (const item of schema.objects) {
    if (!['table','index','trigger'].includes(item.type) || !/^CREATE\s+(TABLE|UNIQUE INDEX|INDEX|TRIGGER)\s/i.test(item.sql) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item.name) || item.name === receiptName || expected.has(item.name)) throw new Error('Invalid role schema object')
    expected.set(item.name,item)
  }
  const digest = roleSchemaDigest([...expected.values()])
  let existing = (await inventory(database)).results
  const storedReceipt = existing.find(item => item.name === receiptName)
  if (!storedReceipt) {
    if (existing.length) throw new Error('Refusing to bootstrap an unowned database')
    await database.batch([database.prepare(receiptSQL),database.prepare(`INSERT INTO p1_schema_bootstrap
      (id,role,digest,operation_id,created_at) VALUES (1,?,?,?,?)`).bind(schema.role,digest,operationId,new Date().toISOString())])
    existing = (await inventory(database)).results
  } else if (canonical(storedReceipt.sql) !== canonical(receiptSQL)) throw new Error('P1 bootstrap receipt schema drift')
  let receipt = await database.prepare('SELECT role,digest,operation_id,completed FROM p1_schema_bootstrap WHERE id=1')
    .first<{ role: string; digest: string; operation_id: string; completed: number }>()
  let upgradedFrom: string | null = null, added = 0
  if (receipt && receipt.role === schema.role && receipt.digest !== digest && migration &&
    receipt.digest === migration.fromDigest && receipt.operation_id === migration.fromOperationId && receipt.completed === 1) {
    const additions = new Set(migration.addedObjects)
    const oldTarget = schema.objects.filter(item => !additions.has(item.name))
    const newObjects = schema.objects.filter(item => additions.has(item.name))
    // Pin the entire old schema, not just the added table's name. Reject edits,
    // deletions, unknown additions and an incomplete or drifted old database.
    if (!additions.size || newObjects.length !== additions.size || roleSchemaDigest(oldTarget) !== migration.fromDigest ||
      !additions.has('site_control_schema_migrations') || operationId === migration.fromOperationId) throw new Error('Invalid reviewed additive migration')
    const old = existing.filter(item => item.name !== receiptName)
    if (old.length !== oldTarget.length || old.some(item => {
      const target = oldTarget.find(target => target.name === item.name)
      return !target || item.type !== target.type || canonical(item.sql) !== canonical(target.sql)
    })) throw new Error('P1 source schema drift before migration')
    // One D1 transaction: additive DDL, durable provenance and receipt advance.
    // Failure rolls back all three. A lost response can retry the target receipt.
    await database.batch([
      ...newObjects.map(item => database.prepare(item.sql)),
      database.prepare(`INSERT INTO site_control_schema_migrations (operation_id,from_digest,to_digest,applied_at) VALUES (?,?,?,?)`)
        .bind(operationId,migration.fromDigest,digest,new Date().toISOString()),
      database.prepare(`UPDATE p1_schema_bootstrap SET digest=?,operation_id=?,completed_at=? WHERE id=1 AND digest=? AND operation_id=?`)
        .bind(digest,operationId,new Date().toISOString(),migration.fromDigest,migration.fromOperationId),
    ])
    upgradedFrom = migration.fromDigest; added = newObjects.length
    existing = (await inventory(database)).results
    receipt = await database.prepare('SELECT role,digest,operation_id,completed FROM p1_schema_bootstrap WHERE id=1')
      .first<{ role: string; digest: string; operation_id: string; completed: number }>()
  }
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
  return { role: schema.role,operationId,digest,objects: expected.size,created: missing.length + added,upgradedFrom }
}
