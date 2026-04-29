import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * 操作手册（`operation-manuals`）：租户级 SOP 文档。Idempotent: skips if `operation_manuals` exists.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'operation_manuals'`,
  )
  if (tableCheck?.c) {
    await addLockedDocumentsRelsColumn(db)
    return
  }

  await db.run(sql`CREATE TABLE \`operation_manuals\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`slug\` text,
  	\`level\` text DEFAULT 'standard' NOT NULL,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`summary\` text,
  	\`search_keywords\` text,
  	\`body\` text,
  	\`sort_order\` integer DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`operation_manuals_tenant_idx\` ON \`operation_manuals\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`operation_manuals_slug_idx\` ON \`operation_manuals\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`operation_manuals_level_idx\` ON \`operation_manuals\` (\`level\`);`)
  await db.run(sql`CREATE INDEX \`operation_manuals_status_idx\` ON \`operation_manuals\` (\`status\`);`)
  await db.run(
    sql`CREATE INDEX \`operation_manuals_sort_order_idx\` ON \`operation_manuals\` (\`sort_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`operation_manuals_updated_at_idx\` ON \`operation_manuals\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`operation_manuals_created_at_idx\` ON \`operation_manuals\` (\`created_at\`);`,
  )

  await addLockedDocumentsRelsColumn(db)
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'operation_manuals_id')) {
    return
  }
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`operation_manuals_id\` integer REFERENCES operation_manuals(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_operation_manuals_id_idx\` ON \`payload_locked_documents_rels\` (\`operation_manuals_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260502_120000_operation_manuals: down not supported. Restore from backup instead.')
}
