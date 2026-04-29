import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type MasterRow = { name: string; sql: string | null }

type LockedParentRef = { relId: number; ref: number }

/**
 * Admin locked-doc rows reference `articles`/`pages` by id. SQLite (and D1) may still refuse
 * `DROP TABLE articles` while those FKs exist, even with `foreign_keys=OFF` in batch.
 * Stash, null out, rebuild parent, then restore (ids unchanged after `INSERT … SELECT *`).
 */
async function stashAndClearLockedParentRefs(
  db: MigrateUpArgs['db'],
  column: 'articles_id' | 'pages_id',
): Promise<LockedParentRef[]> {
  const rows = await db.all<{ id: number; ref: unknown }>(
    sql.raw(
      `SELECT id, ${column} AS ref FROM payload_locked_documents_rels WHERE ${column} IS NOT NULL`,
    ),
  )
  const mapped: LockedParentRef[] = rows
    .filter((r) => r.ref != null && Number.isFinite(Number(r.ref)))
    .map((r) => ({ relId: r.id, ref: Number(r.ref) }))
  if (mapped.length === 0) return []
  await db.run(
    sql.raw(
      `UPDATE payload_locked_documents_rels SET ${column} = NULL WHERE ${column} IS NOT NULL`,
    ),
  )
  return mapped
}

async function restoreLockedParentRefs(
  db: MigrateUpArgs['db'],
  column: 'articles_id' | 'pages_id',
  rows: LockedParentRef[],
): Promise<void> {
  for (const r of rows) {
    await db.run(
      sql.raw(
        `UPDATE payload_locked_documents_rels SET ${column} = ${r.ref} WHERE id = ${r.relId}`,
      ),
    )
  }
}

/** D1: `PRAGMA foreign_keys` must run in same `batch()` as DROP parent or FK guards still fire. */
type D1Client = {
  batch: (stmts: { run: () => Promise<unknown> }[]) => Promise<unknown[]>
  prepare: (query: string) => { run: () => Promise<unknown> }
}

function getD1Client(db: MigrateUpArgs['db']): D1Client | undefined {
  const c = (db as { $client?: unknown }).$client
  if (
    c &&
    typeof (c as D1Client).batch === 'function' &&
    typeof (c as D1Client).prepare === 'function'
  ) {
    return c as D1Client
  }
  return undefined
}

async function runForeignKeysOffRebuild(
  db: MigrateUpArgs['db'],
  args: {
    table: 'pages' | 'articles'
    indexNames: string[]
    indexDdls: string[]
  },
): Promise<void> {
  const { table, indexNames, indexDdls } = args
  const stmts = [
    'PRAGMA foreign_keys = OFF',
    ...indexNames.map((name) => `DROP INDEX IF EXISTS \`${name}\``),
    `DROP TABLE \`${table}\``,
    `ALTER TABLE \`__new_${table}\` RENAME TO \`${table}\``,
    ...indexDdls,
    'PRAGMA foreign_keys = ON',
  ]

  const d1 = getD1Client(db)
  if (d1) {
    await d1.batch(stmts.map((q) => d1.prepare(q)))
    return
  }

  /** Fallback for non-D1 drizzle (unexpected in this project). */
  await db.run(sql`PRAGMA foreign_keys = OFF`)
  for (const q of stmts.slice(1, -1)) {
    await db.run(sql.raw(q))
  }
  await db.run(sql`PRAGMA foreign_keys = ON`)
}

/**
 * Some databases still have `pages.site_id` / `articles.site_id` referencing
 * migration backup table `sites_mig_old_20260629` so inserts referencing real
 * `sites.id` fail with SQLITE_CONSTRAINT FOREIGN KEY.
 *
 * Same pattern as `20260708_120000_repair_site_id_fk_to_sites.ts` for `categories`.
 * D1 requires rebuilding the parent table in a single `batch()` after `foreign_keys=OFF`.
 */
async function repairTable(
  db: MigrateUpArgs['db'],
  table: 'pages' | 'articles',
): Promise<void> {
  await db.run(sql.raw(`DROP TABLE IF EXISTS \`__new_${table}\``))

  const rows = await db.all<MasterRow>(
    sql.raw(
      `SELECT name, sql FROM sqlite_master WHERE type='table' AND name='${table}'`,
    ),
  )
  const ddlRow = rows[0]
  const ddl = ddlRow?.sql ?? ''
  if (!ddl.includes('sites_mig_old_20260629')) return

  const indexRows = await db.all<MasterRow>(
    sql.raw(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='${table}' AND sql IS NOT NULL`,
    ),
  )

  const newDdl = ddl
    .replace(`CREATE TABLE \`${table}\``, `CREATE TABLE \`__new_${table}\``)
    .replace(/"sites_mig_old_20260629"/g, '`sites`')
    .replace(/`sites_mig_old_20260629`/g, '`sites`')

  await db.run(sql.raw(newDdl))
  await db.run(sql.raw(`INSERT INTO \`__new_${table}\` SELECT * FROM \`${table}\``))

  const indexNames = indexRows.map((r) => r.name)
  const indexDdls = indexRows.map((r) => r.sql).filter((s): s is string => Boolean(s))

  const lockCol = table === 'articles' ? 'articles_id' : 'pages_id'
  const locked = await stashAndClearLockedParentRefs(db, lockCol)
  try {
    await runForeignKeysOffRebuild(db, { table, indexNames, indexDdls })
  } finally {
    await restoreLockedParentRefs(db, lockCol, locked)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  /** Stray temp tables from a previously failed run. */
  await db.run(sql`DROP TABLE IF EXISTS \`__repair_site_fk_articles\``)

  await repairTable(db, 'pages')
  await repairTable(db, 'articles')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
