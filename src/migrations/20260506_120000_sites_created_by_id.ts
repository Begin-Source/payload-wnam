import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Sites.createdBy → optional FK to users (creator-scoped visibility for site-manager / team-lead).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('created_by_id')) {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`created_by_id\` integer REFERENCES users(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`sites_created_by_id_idx\` ON \`sites\` (\`created_by_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260506_120000_sites_created_by_id: down not supported.')
}
