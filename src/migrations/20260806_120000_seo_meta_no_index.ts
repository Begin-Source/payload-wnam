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

/** SEO plugin `meta.noIndex` — align HTML robots with sitemap exclusion. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'articles', [{ name: 'meta_no_index', ddl: 'integer DEFAULT 0' }])
  await addColumns(db, 'pages', [{ name: 'meta_no_index', ddl: 'integer DEFAULT 0' }])
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
