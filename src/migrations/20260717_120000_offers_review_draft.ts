import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

async function ensureColumn(
  db: MigrateUpArgs['db'],
  column: string,
  ddlSuffix: string,
): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('offers')`)
  if (cols.some((c) => c.name === column)) return
  try {
    await db.run(sql.raw(`ALTER TABLE \`offers\` ADD \`${column}\` ${ddlSuffix};`))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
}

/** Offer review MDX generation workflow (OpenRouter) — mirrors merchant slot field shape. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await ensureColumn(db, 'review_draft_workflow_status', `text DEFAULT 'idle'`)
  await ensureColumn(db, 'review_draft_workflow_log', 'text')
  await ensureColumn(db, 'review_draft_workflow_updated_at', 'text')
  await ensureColumn(db, 'review_draft_slug', 'text')
  await ensureColumn(db, 'review_draft_mdx', 'text')
  await ensureColumn(db, 'review_draft_status', `text DEFAULT 'draft'`)

  await db.run(sql`
    UPDATE offers
    SET review_draft_workflow_status = 'idle'
    WHERE review_draft_workflow_status IS NULL OR TRIM(COALESCE(review_draft_workflow_status, '')) = ''
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
