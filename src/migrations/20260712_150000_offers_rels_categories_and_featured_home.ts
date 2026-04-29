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
 * `Offers.categories` (hasMany → categories) and `Offers.featuredOnHomeForSites` (hasMany → sites).
 * Column names match Payload/Drizzle snake_case for those fields.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'offers_rels', [
    {
      name: 'categories_id',
      ddl: 'integer REFERENCES categories(id) ON UPDATE no action ON DELETE cascade',
    },
    {
      name: 'featured_on_home_for_sites_id',
      ddl: 'integer REFERENCES sites(id) ON UPDATE no action ON DELETE cascade',
    },
  ])
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`offers_rels_categories_id_idx\` ON \`offers_rels\` (\`categories_id\`);`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate') && !msg.includes('already exists')) throw e
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`offers_rels_featured_on_home_for_sites_id_idx\` ON \`offers_rels\` (\`featured_on_home_for_sites_id\`);`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate') && !msg.includes('already exists')) throw e
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
