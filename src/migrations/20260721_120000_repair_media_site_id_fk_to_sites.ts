import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type MasterRow = { name: string; sql: string | null }

/**
 * Some databases still have `media.site_id` referencing migration backup table
 * `sites_mig_old_20260629`, so INSERTs using real `sites.id` fail (SQLITE_CONSTRAINT).
 * Same repair pattern as `20260712_130000_repair_pages_articles_site_id_fk_to_sites.ts`.
 */
async function repairMediaSiteFk(db: MigrateUpArgs['db']): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`__new_media\``)

  const rows = await db.all<MasterRow>(
    sql.raw(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name='media'`),
  )
  const ddlRow = rows[0]
  const ddl = ddlRow?.sql ?? ''
  if (!ddl.includes('sites_mig_old_20260629')) return

  const indexRows = await db.all<MasterRow>(
    sql.raw(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='media' AND sql IS NOT NULL`,
    ),
  )

  const newDdl = ddl
    .replace(/^CREATE TABLE `media`/m, 'CREATE TABLE `__new_media`')
    .replace(/^CREATE TABLE "media"/m, 'CREATE TABLE `__new_media`')
    .replace(/"sites_mig_old_20260629"/g, '`sites`')
    .replace(/`sites_mig_old_20260629`/g, '`sites`')

  await db.run(sql.raw(newDdl))
  await db.run(sql.raw(`INSERT INTO \`__new_media\` SELECT * FROM \`media\``))

  const indexNames = indexRows.map((r) => r.name)
  const indexDdls = indexRows.map((r) => r.sql).filter((s): s is string => Boolean(s))

  type D1Client = {
    batch: (stmts: { run: () => Promise<unknown> }[]) => Promise<unknown[]>
    prepare: (query: string) => { run: () => Promise<unknown> }
  }

  const getD1Client = (d: MigrateUpArgs['db']): D1Client | undefined => {
    const c = (d as { $client?: unknown }).$client
    if (
      c &&
      typeof (c as D1Client).batch === 'function' &&
      typeof (c as D1Client).prepare === 'function'
    ) {
      return c as D1Client
    }
    return undefined
  }

  const table = 'media'
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

  await db.run(sql`PRAGMA foreign_keys = OFF`)
  for (const q of stmts.slice(1, -1)) {
    await db.run(sql.raw(q))
  }
  await db.run(sql`PRAGMA foreign_keys = ON`)
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await repairMediaSiteFk(db)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
