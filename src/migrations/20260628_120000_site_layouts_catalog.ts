import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * `site-layouts` 目录表 + `payload_locked_documents_rels` 外键 + 每种 layout 一条说明（种子）。
 * 多站点共用一个 blueprint 时种子与「站点」无耦合；`layout_key` 全表唯一。若已存在表则只补 rels/种子。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_layouts'`,
  )
  if (!tableCheck?.c) {
    await db.run(sql`CREATE TABLE \`site_layouts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`layout_key\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`preview_url\` text,
  	\`sort_order\` integer DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
    await db.run(
      sql`CREATE UNIQUE INDEX \`site_layouts_layout_key_idx\` ON \`site_layouts\` (\`layout_key\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`site_layouts_sort_order_idx\` ON \`site_layouts\` (\`sort_order\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`site_layouts_updated_at_idx\` ON \`site_layouts\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`site_layouts_created_at_idx\` ON \`site_layouts\` (\`created_at\`);`,
    )
  }

  await addLockedDocumentsRelsColumn(db)
  await seedLayoutRowsIfEmpty(db)
}

async function seedLayoutRowsIfEmpty(db: MigrateUpArgs['db']): Promise<void> {
  const n = await db.get<{ c: number }>(sql`SELECT COUNT(*) as c FROM site_layouts`)
  if (n && n.c > 0) return

  const ts = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
  await db.run(
    sql.raw(`INSERT INTO \`site_layouts\` (
  \`layout_key\`, \`name\`, \`description\`, \`preview_url\`, \`sort_order\`, \`updated_at\`, \`created_at\`
) VALUES
  ('', '（默认标准）', '留空时与标准壳一致，等同未单独指定变体。', NULL, 0, ${ts}, ${ts}),
  ('default', '标准（与历史一致）', '历史默认博客整站壳。', NULL, 1, ${ts}, ${ts}),
  ('wide', '宽版内容区', '主内容区加宽的博客壳。', NULL, 2, ${ts}, ${ts}),
  ('affiliate_reviews', '联盟测评站（BBF 风格壳 + 首页）', '联盟测评/BBF 风格首页 + 整站壳。', NULL, 3, ${ts}, ${ts}),
  ('template1', 'Template1（整站顶栏 + 主从栏 + 页脚）', '顶栏/主从栏/页脚；文案在「设计」t1LocaleJson 等中配置。', NULL, 4, ${ts}, ${ts});
`),
  )
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'site_layouts_id')) return
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`site_layouts_id\` integer REFERENCES site_layouts(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_site_layouts_id_idx\` ON \`payload_locked_documents_rels\` (\`site_layouts_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260628_120000_site_layouts_catalog: down not supported')
}
