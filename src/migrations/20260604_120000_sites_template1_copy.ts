import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Template1 文案不能放在 `sites`：D1 单表最多 100 列，`sites` 已满，无法再 `ADD COLUMN`。
 * 使用独立表 `site_t1_locales`（每站点一条，`site_id` 唯一）存 `t1_locale_json`。
 * 并补 `payload_locked_documents_rels.site_t1_locales_id` 以免 Admin 详情空白。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`site_t1_locales\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`site_id\` integer NOT NULL,
      \`t1_locale_json\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`site_t1_locales_site_idx\` ON \`site_t1_locales\` (\`site_id\`);`,
  )

  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('site_t1_locales_id')) {
    try {
      await db.run(
        sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`site_t1_locales_id\` integer REFERENCES site_t1_locales(id);`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_site_t1_locales_id_idx\` ON \`payload_locked_documents_rels\` (\`site_t1_locales_id\`);`,
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
