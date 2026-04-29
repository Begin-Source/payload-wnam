import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Global `public-landing` (fallback) + per-site landing overrides on `sites`.
 * Idempotent for partially applied local DBs (IF NOT EXISTS / OR IGNORE / skip duplicate columns).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`public_landing\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`site_name\` text,
  	\`browser_title\` text,
  	\`tagline\` text,
  	\`logged_in_title\` text,
  	\`logged_in_subtitle\` text,
  	\`footer_line\` text,
  	\`admin_cta_label\` text,
  	\`background_color\` text,
  	\`text_color\` text,
  	\`muted_text_color\` text,
  	\`cta_background_color\` text,
  	\`cta_text_color\` text,
  	\`font_preset\` text DEFAULT 'system',
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(
    sql`INSERT OR IGNORE INTO \`public_landing\` (
    \`id\`, \`site_name\`, \`browser_title\`, \`tagline\`, \`logged_in_title\`, \`logged_in_subtitle\`, \`footer_line\`, \`admin_cta_label\`,
    \`background_color\`, \`text_color\`, \`muted_text_color\`, \`cta_background_color\`, \`cta_text_color\`, \`font_preset\`, \`updated_at\`, \`created_at\`
  ) VALUES (
    1,
    '基源科技',
    '基源科技',
    '云系统',
    '欢迎回到基源科技',
    '安全登录后即可管理后台与业务数据',
    '© 基源科技 · 内部系统请勿外传',
    '前往管理后台',
    '#000000',
    '#ffffff',
    'rgba(255, 255, 255, 0.55)',
    '#ffffff',
    '#000000',
    'system',
    datetime('now'),
    datetime('now')
  );`,
  )

  const landingColumns: { name: string; ddl: string }[] = [
    { name: 'landing_browser_title', ddl: 'text' },
    { name: 'landing_site_name', ddl: 'text' },
    { name: 'landing_tagline', ddl: 'text' },
    { name: 'landing_logged_in_title', ddl: 'text' },
    { name: 'landing_logged_in_subtitle', ddl: 'text' },
    { name: 'landing_footer_line', ddl: 'text' },
    { name: 'landing_cta_label', ddl: 'text' },
    { name: 'landing_bg_color', ddl: 'text' },
    { name: 'landing_text_color', ddl: 'text' },
    { name: 'landing_muted_color', ddl: 'text' },
    { name: 'landing_cta_bg_color', ddl: 'text' },
    { name: 'landing_cta_text_color', ddl: 'text' },
    { name: 'landing_font_preset', ddl: 'text' },
  ]

  for (const { name, ddl } of landingColumns) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`sites\` ADD \`${name}\` ${ddl};`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`public_landing\`;`)
  // `sites` landing columns are not dropped here (SQLite/D1 forward-only); restore from backup if needed.
}
