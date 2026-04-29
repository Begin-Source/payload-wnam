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
 * @payloadcms/plugin-seo `meta` group (non-localized): title, description, image.
 * UI-only fields (overview, preview) are not stored.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = [
    { name: 'meta_title', ddl: 'text' },
    { name: 'meta_description', ddl: 'text' },
    {
      name: 'meta_image_id',
      ddl: 'integer REFERENCES media(id) ON UPDATE no action ON DELETE set null',
    },
  ]
  await addColumns(db, 'articles', cols)
  await addColumns(db, 'pages', cols)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
