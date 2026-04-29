import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * 20260624 已 DROP `landing_templates`，但部分环境 `ALTER TABLE ... DROP COLUMN` 未生效，导致
 * `sites.landing_template_id` 仍带 `REFERENCES landing_templates(id)`，以及大量已迁到 blueprint 的 `t1_*` 死列。
 *
 * D1 上对 `DROP TABLE sites` / 删备份表常因外键无法关闭而失败，故本迁移用 SQLite 3.35+ 的
 * **逐列 `DROP COLUMN`**（并先删相关索引），避免整表 DROP/RENAME。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await dropSitesOrphanColumns(db)
  await dropLockedDocsLandingTemplatesIdColumn(db)
}

function shouldDropSitesColumn(name: string): boolean {
  if (name === 'landing_template_id') return true
  if (name.startsWith('t1_')) return true
  return false
}

async function runIgnoreNoSuch(
  db: MigrateUpArgs['db'],
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      msg.includes('no such column') ||
      msg.includes('no such index') ||
      msg.includes('duplicate column')
    ) {
      return
    }
    throw e
  }
}

async function dropSitesOrphanColumns(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<{ name: string }>(sql`PRAGMA table_info('sites')`)
  const toDrop = cols.map((c) => c.name).filter(shouldDropSitesColumn)
  if (toDrop.length === 0) return

  await runIgnoreNoSuch(db, () =>
    db.run(sql`DROP INDEX IF EXISTS \`sites_landing_template_idx\``),
  )

  for (const col of toDrop) {
    await runIgnoreNoSuch(db, () =>
      db.run(sql.raw(`ALTER TABLE \`sites\` DROP COLUMN \`${col.replace(/`/g, '``')}\``)),
    )
  }
}

async function dropLockedDocsLandingTemplatesIdColumn(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<{ name: string }>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (!cols.some((c) => c.name === 'landing_templates_id')) return

  await runIgnoreNoSuch(db, () =>
    db.run(
      sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_landing_templates_id_idx\``,
    ),
  )

  await runIgnoreNoSuch(db, () =>
    db.run(
      sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`landing_templates_id\``),
    ),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
