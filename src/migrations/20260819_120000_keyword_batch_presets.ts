import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Tenant-scoped keyword batch presets; optional on `sites` for admin drawer prefill.
 * Adds `sites.keyword_batch_preset_id` and `payload_locked_documents_rels.keyword_batch_presets_id`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'keyword_batch_presets'`,
  )
  if (!tableCheck?.c) {
    await db.run(sql`CREATE TABLE \`keyword_batch_presets\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`description\` text,
  	\`batch_mode\` text DEFAULT 'default' NOT NULL,
  	\`default_batch_limit\` numeric,
  	\`eligible_only\` integer,
  	\`intent_whitelist\` text,
  	\`min_volume\` numeric,
  	\`max_volume\` numeric,
  	\`max_kd\` numeric,
  	\`max_pick\` numeric,
  	\`cluster_before_enqueue\` integer,
  	\`cluster_min_overlap\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
    await db.run(
      sql`CREATE INDEX \`keyword_batch_presets_tenant_idx\` ON \`keyword_batch_presets\` (\`tenant_id\`);`,
    )
    await db.run(sql`CREATE INDEX \`keyword_batch_presets_slug_idx\` ON \`keyword_batch_presets\` (\`slug\`);`)
    await db.run(
      sql`CREATE INDEX \`keyword_batch_presets_updated_at_idx\` ON \`keyword_batch_presets\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`keyword_batch_presets_created_at_idx\` ON \`keyword_batch_presets\` (\`created_at\`);`,
    )
    await db.run(sql`
      CREATE UNIQUE INDEX \`keyword_batch_presets_tenant_slug_unique\`
      ON \`keyword_batch_presets\` (\`tenant_id\`, \`slug\`);
    `)
  }

  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (!relCols.some((c) => c.name === 'keyword_batch_presets_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`keyword_batch_presets_id\` integer REFERENCES keyword_batch_presets(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_keyword_batch_presets_id_idx\` ON \`payload_locked_documents_rels\` (\`keyword_batch_presets_id\`);`,
    )
  }

  const siteCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!siteCols.some((c) => c.name === 'keyword_batch_preset_id')) {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`keyword_batch_preset_id\` integer REFERENCES keyword_batch_presets(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`sites_keyword_batch_preset_id_idx\` ON \`sites\` (\`keyword_batch_preset_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260819_120000_keyword_batch_presets is irreversible; restore from backup instead.',
  )
}
