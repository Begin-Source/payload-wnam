import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

function addColumnIfMissing(db: MigrateUpArgs['db'], column: string, ddl: string): Promise<void> {
  return (async () => {
    const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('site_blueprints')`)
    if (cols.some((c) => c.name === column)) return
    try {
      await db.run(sql.raw(ddl))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  })()
}

/**
 * Append-only design workflow log (human-readable) for admin; separate from last-error columns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumnIfMissing(
    db,
    'design_workflow_log',
    `ALTER TABLE \`site_blueprints\` ADD \`design_workflow_log\` text;`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
