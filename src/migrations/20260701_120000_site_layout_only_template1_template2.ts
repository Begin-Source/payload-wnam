import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * 站点与目录保留 template1 / template2 / amz-template-1：收束 sites.site_layout，删除 site_layouts 中其它行并清理锁定关联。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const sitesCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'sites'`,
  )
  if (sitesCheck?.c) {
    await db.run(sql`
      UPDATE sites
      SET site_layout = 'template1'
      WHERE site_layout IS NULL
         OR TRIM(COALESCE(site_layout, '')) = ''
         OR LOWER(TRIM(site_layout)) NOT IN ('template1', 'template2', 'amz-template-1')
    `)
  }

  const catCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_layouts'`,
  )
  if (!catCheck?.c) return

  const relCols = await db.all<{ name: string }>(
    sql`PRAGMA table_info('payload_locked_documents_rels')`,
  )
  const hasSiteLayoutsRel = relCols.some((c) => c.name === 'site_layouts_id')
  if (hasSiteLayoutsRel) {
    await db.run(sql`
      DELETE FROM payload_locked_documents_rels
      WHERE site_layouts_id IS NOT NULL
        AND site_layouts_id IN (
          SELECT id FROM site_layouts WHERE LOWER(TRIM(layout_key)) NOT IN ('template1', 'template2', 'amz-template-1')
        )
    `)
  }

  await db.run(sql`
    DELETE FROM site_layouts
    WHERE LOWER(TRIM(layout_key)) NOT IN ('template1', 'template2', 'amz-template-1')
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
