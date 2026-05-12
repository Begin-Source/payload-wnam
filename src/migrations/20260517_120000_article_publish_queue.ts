import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Adds article-level automatic publish queue fields.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('articles')`)

  if (!cols.some((c) => c.name === 'publish_queue_status')) {
    await db.run(sql`ALTER TABLE \`articles\` ADD \`publish_queue_status\` text DEFAULT 'none';`)
  }
  if (!cols.some((c) => c.name === 'scheduled_publish_at')) {
    await db.run(sql`ALTER TABLE \`articles\` ADD \`scheduled_publish_at\` text;`)
  }
  if (!cols.some((c) => c.name === 'publish_eligible')) {
    await db.run(sql`ALTER TABLE \`articles\` ADD \`publish_eligible\` integer DEFAULT 0;`)
  }
  if (!cols.some((c) => c.name === 'publish_blocked_reason')) {
    await db.run(sql`ALTER TABLE \`articles\` ADD \`publish_blocked_reason\` text;`)
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260517_120000_article_publish_queue is irreversible; restore from backup instead.',
  )
}
