import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

function addColumnIfMissing(db: MigrateUpArgs['db'], column: string, ddl: string): Promise<void> {
  return (async () => {
    const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('pages')`)
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
 * Trust / legal page bundle (OpenRouter) workflow status, log, and last error on `pages` (trust slugs only).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumnIfMissing(
    db,
    'site_pages_bundle_workflow_status',
    `ALTER TABLE \`pages\` ADD \`site_pages_bundle_workflow_status\` text DEFAULT 'idle';`,
  )
  await addColumnIfMissing(
    db,
    'site_pages_bundle_workflow_log',
    `ALTER TABLE \`pages\` ADD \`site_pages_bundle_workflow_log\` text;`,
  )
  await addColumnIfMissing(
    db,
    'site_pages_bundle_last_error_code',
    `ALTER TABLE \`pages\` ADD \`site_pages_bundle_last_error_code\` text;`,
  )
  await addColumnIfMissing(
    db,
    'site_pages_bundle_last_error_detail',
    `ALTER TABLE \`pages\` ADD \`site_pages_bundle_last_error_detail\` text;`,
  )
  await addColumnIfMissing(
    db,
    'site_pages_bundle_last_error_at',
    `ALTER TABLE \`pages\` ADD \`site_pages_bundle_last_error_at\` text;`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
