import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(`ALTER TABLE \`sites\` ADD \`site_layout\` text DEFAULT 'default';`),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
