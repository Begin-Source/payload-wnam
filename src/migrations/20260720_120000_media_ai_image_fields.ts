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

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'media', [
    { name: 'ai_image_prompt', ddl: 'text' },
    { name: 'ai_image_gen_status', ddl: "text DEFAULT 'idle'" },
    { name: 'ai_image_gen_error', ddl: 'text' },
    { name: 'ai_image_gen_at', ddl: 'text' },
    { name: 'ai_image_prompt_source', ddl: 'text' },
  ])
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite cannot DROP COLUMN without rebuild; no-op for safety.
  await db.run(sql`SELECT 1`)
}
