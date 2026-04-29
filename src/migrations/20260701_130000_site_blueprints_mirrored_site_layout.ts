import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `site_blueprints.mirrored_site_layout` — backfill from linked `sites.site_layout` for admin field conditions.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_blueprints'`,
  )
  if (!tableCheck?.c) return

  const cols = await db.all<{ name: string }>(sql`PRAGMA table_info('site_blueprints')`)
  const hasCol = cols.some((c) => c.name === 'mirrored_site_layout')
  if (!hasCol) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`site_blueprints\` ADD \`mirrored_site_layout\` text DEFAULT 'template1';`,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  await db.run(sql`
    UPDATE site_blueprints
    SET mirrored_site_layout = CASE
      WHEN site_id IS NULL THEN 'template1'
      WHEN LOWER(TRIM(COALESCE((SELECT site_layout FROM sites WHERE sites.id = site_blueprints.site_id), ''))) = 'template2'
      THEN 'template2'
      WHEN LOWER(TRIM(COALESCE((SELECT site_layout FROM sites WHERE sites.id = site_blueprints.site_id), ''))) = 'amz-template-1'
      THEN 'amz-template-1'
      ELSE 'template1'
    END
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
