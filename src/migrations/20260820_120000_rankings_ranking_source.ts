import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Distinguish live SERP rank-track rows vs DataForSEO Labs domain ranked-keyword imports.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('rankings')`)
  if (!cols.some((c) => c.name === 'ranking_source')) {
    await db.run(sql`ALTER TABLE \`rankings\` ADD \`ranking_source\` text DEFAULT 'serp_live';`)
    await db.run(
      sql`UPDATE \`rankings\` SET \`ranking_source\` = 'serp_live' WHERE \`ranking_source\` IS NULL;`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260820_120000_rankings_ranking_source is irreversible; restore from backup instead.',
  )
}
