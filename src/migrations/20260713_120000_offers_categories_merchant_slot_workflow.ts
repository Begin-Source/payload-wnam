import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

async function ensureColumn(
  db: MigrateUpArgs['db'],
  table: 'offers' | 'categories',
  column: string,
  ddlSuffix: string,
): Promise<void> {
  const cols = await db.all<TableInfoRow>(
    table === 'offers'
      ? sql`PRAGMA table_info('offers')`
      : sql`PRAGMA table_info('categories')`,
  )
  if (cols.some((c) => c.name === column)) return
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${column}\` ${ddlSuffix};`))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
}

/**
 * Merchant slot workflow (DataForSEO → Offers) on `offers` and batch/summary fields on `categories`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await ensureColumn(
    db,
    'offers',
    'merchant_slot_workflow_status',
    `text DEFAULT 'idle'`,
  )
  await ensureColumn(db, 'offers', 'merchant_slot_workflow_log', 'text')
  await ensureColumn(db, 'offers', 'merchant_slot_workflow_updated_at', 'text')
  await ensureColumn(
    db,
    'offers',
    'merchant_slot_source_category_id',
    `integer REFERENCES categories(id) ON UPDATE no action ON DELETE set null`,
  )
  await ensureColumn(db, 'offers', 'merchant_batch_id', 'text')
  await ensureColumn(db, 'offers', 'merchant_slot_last_payload', 'text')

  await ensureColumn(
    db,
    'categories',
    'merchant_offer_fetch_workflow_status',
    `text DEFAULT 'idle'`,
  )
  await ensureColumn(db, 'categories', 'merchant_offer_fetch_workflow_log', 'text')
  await ensureColumn(db, 'categories', 'merchant_offer_fetch_df_task_tag', 'text')
  await ensureColumn(db, 'categories', 'merchant_offer_fetch_last_batch_id', 'text')
  await ensureColumn(db, 'categories', 'merchant_offer_fetch_last_summary', 'text')

  await db.run(sql`
    UPDATE offers
    SET merchant_slot_workflow_status = 'idle'
    WHERE merchant_slot_workflow_status IS NULL OR TRIM(COALESCE(merchant_slot_workflow_status, '')) = ''
  `)
  await db.run(sql`
    UPDATE categories
    SET merchant_offer_fetch_workflow_status = 'idle'
    WHERE merchant_offer_fetch_workflow_status IS NULL OR TRIM(COALESCE(merchant_offer_fetch_workflow_status, '')) = ''
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
