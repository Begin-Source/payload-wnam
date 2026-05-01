import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

async function addColumns(
  db: MigrateUpArgs['db'],
  table: string,
  cols: { name: string; ddl: string }[],
): Promise<void> {
  for (const { name, ddl } of cols) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${name}\` ${ddl};`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

/**
 * Keywords: AMZ DFS sync eligibility flags + PipelineSettings JSON defaults for thresholds.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'keywords', [
    { name: 'eligible', ddl: 'integer DEFAULT 0' },
    { name: 'eligibility_reason', ddl: 'text' },
  ])
  await addColumns(db, 'pipeline_settings', [{ name: 'amz_keyword_eligibility', ddl: 'text' }])
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite: DROP COLUMN not universally available; no-op for Cloudflare D1.
  await db.run(sql`SELECT 1`)
}
