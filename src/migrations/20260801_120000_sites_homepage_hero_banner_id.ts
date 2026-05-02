import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `Sites.homepageHeroBanner` → `homepage_hero_banner_id` FK to media.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('homepage_hero_banner_id')) {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`homepage_hero_banner_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`sites_homepage_hero_banner_id_idx\` ON \`sites\` (\`homepage_hero_banner_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260801_120000_sites_homepage_hero_banner_id: down not supported.')
}
