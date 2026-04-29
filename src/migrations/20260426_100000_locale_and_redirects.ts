import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

async function addColumns(
  db: MigrateUpArgs['db'],
  table: string,
  cols: { name: string; ddl: string }[],
): Promise<void> {
  for (const { name, ddl } of cols) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${name}\` ${ddl};`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'redirects_id')) {
    return
  }
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`redirects_id\` integer REFERENCES redirects(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_redirects_id_idx\` ON \`payload_locked_documents_rels\` (\`redirects_id\`);`,
  )
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'articles', [{ name: 'locale', ddl: "text DEFAULT 'zh'" }])
  await addColumns(db, 'pages', [{ name: 'locale', ddl: "text DEFAULT 'zh'" }])

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`redirects\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`site_id\` integer,
  	\`from_path\` text NOT NULL,
  	\`to_path\` text NOT NULL,
  	\`status_code\` text DEFAULT '301' NOT NULL,
  	\`enabled\` integer DEFAULT 1,
  	\`sort_order\` integer DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`redirects_tenant_idx\` ON \`redirects\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`redirects_site_idx\` ON \`redirects\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`redirects_from_path_idx\` ON \`redirects\` (\`from_path\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`redirects_updated_at_idx\` ON \`redirects\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`redirects_created_at_idx\` ON \`redirects\` (\`created_at\`);`)

  await addLockedDocumentsRelsColumn(db)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
