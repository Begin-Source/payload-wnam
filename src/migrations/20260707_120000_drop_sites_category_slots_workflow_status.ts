import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Slot workflow status is stored only on `categories`; drop redundant `sites.category_slots_workflow_status`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const siteCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (siteCols.some((c) => c.name === 'category_slots_workflow_status')) {
    await db.run(
      sql.raw(`ALTER TABLE \`sites\` DROP COLUMN \`category_slots_workflow_status\`;`),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const siteCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!siteCols.some((c) => c.name === 'category_slots_workflow_status')) {
    await db.run(
      sql.raw(
        `ALTER TABLE \`sites\` ADD \`category_slots_workflow_status\` text DEFAULT 'idle';`,
      ),
    )
  }
  await db.run(sql`
    UPDATE sites
    SET category_slots_workflow_status = 'idle'
    WHERE category_slots_workflow_status IS NULL OR TRIM(COALESCE(category_slots_workflow_status, '')) = ''
  `)
}
