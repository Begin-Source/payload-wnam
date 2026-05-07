import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Categories: Together category cover sync — list badge (idle / running / done / error).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('categories')`)
  if (!cols.some((c) => c.name === 'category_cover_workflow_status')) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`categories\` ADD \`category_cover_workflow_status\` text DEFAULT 'idle';`,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
  await db.run(sql`
    UPDATE categories
    SET category_cover_workflow_status = 'idle'
    WHERE category_cover_workflow_status IS NULL OR TRIM(COALESCE(category_cover_workflow_status, '')) = ''
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
