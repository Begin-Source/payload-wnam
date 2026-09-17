import { provisionUuidSchema, serializeProvisionPlan, type ProvisionPlan } from '../../src/site-control/provisionPlan'
import { migrateSiteRoleState } from '../../src/application-roles/schema'
import { roleSchemaDigest, type RoleSchema } from '../p1-schema'

const receiptName = 'site_schema_bootstrap'
const receiptSQL = `CREATE TABLE site_schema_bootstrap (
  id INTEGER PRIMARY KEY CHECK(id=1),operation_id TEXT NOT NULL,site_id TEXT NOT NULL,
  account_id TEXT NOT NULL,database_id TEXT NOT NULL,digest TEXT NOT NULL,schema_version INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,completed_at TEXT
)`
const canonical = (sql: string) => sql.trim().replace(/;$/,'')
const inventory = (database: D1Database) => database.prepare(`SELECT name,type,sql FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name`)
  .all<RoleSchema['objects'][number]>()

export function validateProvisionSchema(plan: ProvisionPlan,schema: RoleSchema) {
  serializeProvisionPlan(plan)
  if (!['site','site-a','site-b'].includes(schema.role) || !schema.objects.length || schema.objects.length > 2000 ||
    roleSchemaDigest(schema.objects) !== plan.schemaDigest) throw new Error('Provision schema does not match the checked plan')
  const names = new Set<string>()
  for (const object of schema.objects) {
    if (!['table','index','trigger'].includes(object.type) || !/^CREATE\s+(TABLE|UNIQUE INDEX|INDEX|TRIGGER)\s/i.test(object.sql) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(object.name) || object.name === receiptName || names.has(object.name)) throw new Error('Invalid provision schema object')
    names.add(object.name)
  }
}

/** A new-site initializer, not a migration/adoption tool. Ownership and the
 * complete schema are pinned before CREATEs. Partial batches are resumable;
 * unexpected existing objects, changed plans and completed-schema drift fail. */
export async function initializeProvisionSchema(database: D1Database,databaseId: string,plan: ProvisionPlan,schema: RoleSchema,
  options: { beforeWrite: () => Promise<void>; initializeState?: (database: D1Database) => Promise<void> }) {
  validateProvisionSchema(plan,schema)
  provisionUuidSchema.parse(databaseId)
  const expected = new Map(schema.objects.map(object => [object.name,object]))
  let existing = (await inventory(database)).results
  const stored = existing.find(object => object.name === receiptName)
  if (!stored) {
    if (existing.length) throw new Error('Refusing an unowned provision database')
    await options.beforeWrite()
    await database.batch([database.prepare(receiptSQL),database.prepare(`INSERT INTO site_schema_bootstrap
      (id,operation_id,site_id,account_id,database_id,digest,schema_version,created_at) VALUES (1,?,?,?,?,?,?,?)`)
      .bind(plan.operationId,plan.siteId,plan.accountId,databaseId,plan.schemaDigest,plan.schemaVersion,new Date().toISOString())])
    existing = (await inventory(database)).results
  } else if (canonical(stored.sql) !== canonical(receiptSQL)) throw new Error('Provision schema ownership table drift')
  const receipt = await database.prepare('SELECT * FROM site_schema_bootstrap WHERE id=1').first<{
    operation_id: string; site_id: string; account_id: string; database_id: string; digest: string; schema_version: number; completed: number
  }>()
  if (!receipt || receipt.operation_id !== plan.operationId || receipt.site_id !== plan.siteId || receipt.account_id !== plan.accountId ||
    receipt.database_id !== databaseId || receipt.digest !== plan.schemaDigest || receipt.schema_version !== plan.schemaVersion) throw new Error('Provision schema ownership mismatch')
  for (const object of existing) {
    if (object.name === receiptName) continue
    const match = expected.get(object.name)
    if (!match || object.type !== match.type || canonical(object.sql) !== canonical(match.sql)) throw new Error('Provision schema drift')
  }
  const names = new Set(existing.map(object => object.name)), missing = schema.objects.filter(object => !names.has(object.name))
  if (receipt.completed && missing.length) throw new Error('Completed provision schema has missing objects')
  for (let offset = 0; offset < missing.length; offset += 20) {
    await options.beforeWrite()
    await database.batch(missing.slice(offset,offset+20).map(object => database.prepare(object.sql)))
  }
  await options.beforeWrite()
  await (options.initializeState ?? migrateSiteRoleState)(database)
  const actual = (await inventory(database)).results.filter(object => object.name !== receiptName)
  if (actual.length !== expected.size || actual.some(object => object.type !== expected.get(object.name)?.type || canonical(object.sql) !== canonical(expected.get(object.name)?.sql ?? ''))) throw new Error('Provision schema verification failed')
  await options.beforeWrite()
  await database.prepare("UPDATE site_schema_bootstrap SET completed=1,completed_at=COALESCE(completed_at,?) WHERE id=1 AND operation_id=? AND digest=?")
    .bind(new Date().toISOString(),plan.operationId,plan.schemaDigest).run()
  return { databaseId,schemaDigest: plan.schemaDigest,schemaVersion: plan.schemaVersion,objects: expected.size }
}
