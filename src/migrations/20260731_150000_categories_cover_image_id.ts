import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `Categories.coverImage` → `cover_image_id` FK to media.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('categories')`)
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('cover_image_id')) {
    await db.run(
      sql`ALTER TABLE \`categories\` ADD \`cover_image_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`categories_cover_image_id_idx\` ON \`categories\` (\`cover_image_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260731_150000_categories_cover_image_id: down not supported.')
}
