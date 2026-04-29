import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Replaces Global `team-home` with multi-tenant `teams` collection (multiple teams per tenant).
 * Idempotent: skips table creation if `teams` already exists.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`team_home\`;`)

  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'teams'`,
  )
  if (tableCheck?.c) {
    await addLockedDocumentsRelsColumn(db)
    return
  }

  await db.run(sql`CREATE TABLE \`teams\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text,
  	\`notes\` text,
  	\`lead_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`lead_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`teams_tenant_idx\` ON \`teams\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`teams_slug_idx\` ON \`teams\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`teams_lead_idx\` ON \`teams\` (\`lead_id\`);`)
  await db.run(sql`CREATE INDEX \`teams_updated_at_idx\` ON \`teams\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`teams_created_at_idx\` ON \`teams\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`teams_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`teams\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`teams_rels_order_idx\` ON \`teams_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`teams_rels_parent_idx\` ON \`teams_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`teams_rels_path_idx\` ON \`teams_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`teams_rels_users_id_idx\` ON \`teams_rels\` (\`users_id\`);`)

  await addLockedDocumentsRelsColumn(db)
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'teams_id')) {
    return
  }
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`teams_id\` integer REFERENCES teams(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_teams_id_idx\` ON \`payload_locked_documents_rels\` (\`teams_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260501_130000_teams_collection is irreversible without remapping `teams` data. Restore from backup instead.',
  )
}
