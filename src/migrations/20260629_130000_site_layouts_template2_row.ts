import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Catalog row for `template2` (idempotent if row or table missing).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_layouts'`,
  )
  if (!tableCheck?.c) return

  const exists = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM site_layouts WHERE layout_key = 'template2'`,
  )
  if (exists && exists.c > 0) return

  const ts = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
  await db.run(
    sql.raw(`INSERT INTO \`site_layouts\` (
  \`layout_key\`, \`name\`, \`description\`, \`preview_url\`, \`sort_order\`, \`updated_at\`, \`created_at\`
) VALUES (
  'template2',
  'Template2（整站顶栏 + 主从栏 + 页脚 · 第二套主题）',
  '与 Template1 同结构；文案在「设计」t2LocaleJson；样式由 template2-root 主题覆盖。',
  NULL,
  5,
  ${ts},
  ${ts}
);`),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
