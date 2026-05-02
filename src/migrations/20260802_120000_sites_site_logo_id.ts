import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `Sites.siteLogo` → `site_logo_id` FK to media (header + favicon).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('site_logo_id')) {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`site_logo_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`sites_site_logo_id_idx\` ON \`sites\` (\`site_logo_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260802_120000_sites_site_logo_id: down not supported.')
}
