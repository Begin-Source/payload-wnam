import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `site_blueprints.design_workflow_status` — AMZ 等设计流程状态（idle / running / done / error）。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('site_blueprints')`)
  if (!cols.some((c) => c.name === 'design_workflow_status')) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`site_blueprints\` ADD \`design_workflow_status\` text DEFAULT 'idle';`,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  await db.run(sql`
    UPDATE site_blueprints
    SET design_workflow_status = 'idle'
    WHERE design_workflow_status IS NULL OR TRIM(COALESCE(design_workflow_status, '')) = ''
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
