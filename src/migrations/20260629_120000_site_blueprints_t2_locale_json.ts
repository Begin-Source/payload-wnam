import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `site-blueprints` second shell copy layer for `template2` (same key shape as `t1LocaleJson`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('site_blueprints')`)
  if (cols.some((c) => c.name === 't2_locale_json')) return
  try {
    await db.run(
      sql.raw(`ALTER TABLE \`site_blueprints\` ADD \`t2_locale_json\` text;`),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
