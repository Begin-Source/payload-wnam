import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

async function addSitesColumn(
  db: MigrateUpArgs['db'],
  name: string,
  ddl: string,
): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (cols.some((c) => c.name === name)) return
  try {
    await db.run(sql.raw(`ALTER TABLE \`sites\` ADD \`${name}\` ${ddl};`))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
}

/** n8n「Generate Domain」等价字段：主品/细分 JSON、域名生成日志、可查结果、流程状态。 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addSitesColumn(db, 'main_product', 'text')
  await addSitesColumn(db, 'niche_data', 'text')
  await addSitesColumn(db, 'domain_generation_log', 'text')
  await addSitesColumn(db, 'domain_check_status', 'text')
  await addSitesColumn(db, 'domain_check_available', 'integer')
  await addSitesColumn(db, 'domain_check_at', 'text')
  await addSitesColumn(db, 'domain_check_message', 'text')
  await addSitesColumn(db, 'domain_workflow_status', "text DEFAULT 'idle'")
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260630_200000_sites_domain_ai_fields is irreversible without data loss. Restore from backup.',
  )
}
