import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/** Authors `sites` (hasMany) — rel rows need `sites_id` for Payload + D1. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        'ALTER TABLE `authors_rels` ADD `sites_id` integer REFERENCES sites(id) ON UPDATE no action ON DELETE cascade;',
      ),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`authors_rels_sites_id_idx\` ON \`authors_rels\` (\`sites_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
