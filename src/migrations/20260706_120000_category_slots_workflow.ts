import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Categories: slot_index (1–5 managed slots), category_slots_workflow_status (mirror of site task).
 * Sites: category_slots_workflow_status (authoritative for slot generation job).
 * Partial unique: one row per (site_id, slot_index) when slot_index is set.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const catCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('categories')`)
  const catNames = new Set(catCols.map((c) => c.name))

  if (!catNames.has('slot_index')) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`categories\` ADD \`slot_index\` numeric;`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  if (!catNames.has('category_slots_workflow_status')) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`categories\` ADD \`category_slots_workflow_status\` text DEFAULT 'idle';`,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  const siteCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!siteCols.some((c) => c.name === 'category_slots_workflow_status')) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`sites\` ADD \`category_slots_workflow_status\` text DEFAULT 'idle';`,
        ),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  await db.run(sql`
    UPDATE categories
    SET category_slots_workflow_status = 'idle'
    WHERE category_slots_workflow_status IS NULL OR TRIM(COALESCE(category_slots_workflow_status, '')) = ''
  `)
  await db.run(sql`
    UPDATE sites
    SET category_slots_workflow_status = 'idle'
    WHERE category_slots_workflow_status IS NULL OR TRIM(COALESCE(category_slots_workflow_status, '')) = ''
  `)

  const idxCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'index' AND name = 'categories_site_slot_uidx'`,
  )
  if (!idxCheck?.c) {
    await db.run(
      sql.raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS \`categories_site_slot_uidx\` ON \`categories\` (\`site_id\`, \`slot_index\`) WHERE \`slot_index\` IS NOT NULL;`,
      ),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
