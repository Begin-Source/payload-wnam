import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `site-blueprints.amz_site_config_json` — AMZ 壳层 JSON（与 amz-template-1 `siteConfig` 同形）；
 * 目录 `site_layouts` 补 `amz-template-1` 一行；镜像字段与站点布局对齐。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('site_blueprints')`)
  if (!cols.some((c) => c.name === 'amz_site_config_json')) {
    try {
      await db.run(
        sql.raw(`ALTER TABLE \`site_blueprints\` ADD \`amz_site_config_json\` text;`),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_layouts'`,
  )
  if (tableCheck?.c) {
    const exists = await db.get<{ c: number }>(
      sql`SELECT COUNT(*) as c FROM site_layouts WHERE LOWER(TRIM(layout_key)) = 'amz-template-1'`,
    )
    if (!exists?.c) {
      const ts = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
      await db.run(
        sql.raw(`INSERT INTO \`site_layouts\` (
  \`layout_key\`, \`name\`, \`description\`, \`preview_url\`, \`sort_order\`, \`updated_at\`, \`created_at\`
) VALUES (
  'amz-template-1',
  'amz-template-1（Amazon 联盟测评风 · 顶栏/底栏/主题变量）',
  '壳层来自 amz-template-1；可编辑项在关联「设计」amzSiteConfigJson。',
  NULL,
  6,
  ${ts},
  ${ts}
);`),
      )
    }
  }

  const bpCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_blueprints'`,
  )
  if (bpCheck?.c) {
    await db.run(sql`
      UPDATE site_blueprints
      SET mirrored_site_layout = 'amz-template-1'
      WHERE site_id IS NOT NULL
        AND LOWER(TRIM(COALESCE((
          SELECT site_layout FROM sites WHERE sites.id = site_blueprints.site_id
        ), ''))) = 'amz-template-1'
    `)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
