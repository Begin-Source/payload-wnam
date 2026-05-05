import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Per-tenant OpenRouter prompt overrides for domain generation (audience + domain naming).
 * Adds `payload_locked_documents_rels.tenant_prompt_templates_id` for Admin document lock query compatibility.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'tenant_prompt_templates'`,
  )
  if (!tableCheck?.c) {
    await db.run(sql`CREATE TABLE \`tenant_prompt_templates\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer NOT NULL,
  	\`key\` text NOT NULL,
  	\`body\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
    await db.run(
      sql`CREATE INDEX \`tenant_prompt_templates_tenant_idx\` ON \`tenant_prompt_templates\` (\`tenant_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`tenant_prompt_templates_key_idx\` ON \`tenant_prompt_templates\` (\`key\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`tenant_prompt_templates_updated_at_idx\` ON \`tenant_prompt_templates\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`tenant_prompt_templates_created_at_idx\` ON \`tenant_prompt_templates\` (\`created_at\`);`,
    )
    await db.run(sql`
      CREATE UNIQUE INDEX \`tenant_prompt_templates_tenant_key_unique\`
      ON \`tenant_prompt_templates\` (\`tenant_id\`, \`key\`);
    `)
  }

  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (!relCols.some((c) => c.name === 'tenant_prompt_templates_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`tenant_prompt_templates_id\` integer REFERENCES tenant_prompt_templates(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_tenant_prompt_templates_id_idx\` ON \`payload_locked_documents_rels\` (\`tenant_prompt_templates_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260808_120000_tenant_prompt_templates is irreversible; restore from backup instead.',
  )
}
