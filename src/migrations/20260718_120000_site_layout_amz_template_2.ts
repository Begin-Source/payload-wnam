import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Catalog row for `amz-template-2`; mirror `mirrored_site_layout` on blueprints for sites using that layout.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_layouts'`,
  )
  if (tableCheck?.c) {
    const exists = await db.get<{ c: number }>(
      sql`SELECT COUNT(*) as c FROM site_layouts WHERE LOWER(TRIM(layout_key)) = 'amz-template-2'`,
    )
    if (!exists?.c) {
      const ts = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
      await db.run(
        sql.raw(`INSERT INTO \`site_layouts\` (
  \`layout_key\`, \`name\`, \`description\`, \`preview_url\`, \`sort_order\`, \`updated_at\`, \`created_at\`
) VALUES (
  'amz-template-2',
  'amz-template-2（旧版全站结构 · TOC · ASIN 商品页）',
  '壳层在 site-layouts/amz-template-2；配置与同 amz-template-1 共用 amzSiteConfigJson。',
  NULL,
  7,
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
      SET mirrored_site_layout = 'amz-template-2'
      WHERE site_id IS NOT NULL
        AND LOWER(TRIM(COALESCE((
          SELECT site_layout FROM sites WHERE sites.id = site_blueprints.site_id
        ), ''))) = 'amz-template-2'
    `)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
