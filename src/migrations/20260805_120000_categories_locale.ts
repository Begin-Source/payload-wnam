import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Categories: locale (public URL language); unique (site_id, slug, locale).
 * Replaces `categories_site_slot_uidx` with (site_id, slot_index, locale) so each locale can have slots 1–5.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('categories')`)
  const names = new Set(cols.map((c) => c.name))

  if (!names.has('locale')) {
    await db.run(
      sql.raw(
        `ALTER TABLE \`categories\` ADD \`locale\` text DEFAULT 'en';`,
      ),
    )
  }

  await db.run(sql`
    UPDATE categories
    SET locale = 'en'
    WHERE locale IS NULL OR trim(COALESCE(locale, '')) = ''
  `)

  await db.run(sql.raw(`DROP INDEX IF EXISTS \`categories_site_slot_uidx\`;`))

  await db.run(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS \`categories_site_slot_locale_uidx\` ON \`categories\` (\`site_id\`, \`slot_index\`, \`locale\`) WHERE \`slot_index\` IS NOT NULL AND \`site_id\` IS NOT NULL AND \`locale\` IS NOT NULL;`,
    ),
  )

  await db.run(
    sql.raw(`
      UPDATE categories AS c
      SET slug = c.slug || '-dup-' || c.id
      WHERE c.site_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM categories c2
          WHERE c2.site_id = c.site_id
            AND c2.slug = c.slug
            AND c2.id < c.id
        )
    `),
  )

  await db.run(sql.raw(`DROP INDEX IF EXISTS \`categories_site_slug_locale_uidx\`;`))
  await db.run(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS \`categories_site_slug_locale_uidx\` ON \`categories\` (\`site_id\`, \`slug\`, \`locale\`) WHERE \`site_id\` IS NOT NULL AND COALESCE(trim(\`slug\`), '') != '';`,
    ),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
