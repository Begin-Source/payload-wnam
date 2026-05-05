import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Per-tenant pipeline configuration profiles (overrides `pipeline_settings` global).
 * Adds `sites.pipeline_profile_id`, `articles.pipeline_profile_id`,
 * and `payload_locked_documents_rels.pipeline_profiles_id`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_profiles'`,
  )
  if (!tableCheck?.c) {
    await db.run(sql`CREATE TABLE \`pipeline_profiles\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`description\` text,
  	\`is_default\` integer DEFAULT 0,
  	\`tavily_enabled\` integer,
  	\`data_for_seo_enabled\` integer,
  	\`together_image_enabled\` integer,
  	\`default_llm_model\` text,
  	\`default_image_model\` text,
  	\`amazon_marketplace\` text,
  	\`default_locale\` text,
  	\`default_region\` text,
  	\`frugal_mode\` integer,
  	\`eeat_weights\` text,
  	\`llm_models_by_section\` text,
  	\`section_parallelism\` numeric,
  	\`section_parallel_whitelist\` text,
  	\`section_max_retry\` numeric,
  	\`amz_keyword_eligibility\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
    await db.run(
      sql`CREATE INDEX \`pipeline_profiles_tenant_idx\` ON \`pipeline_profiles\` (\`tenant_id\`);`,
    )
    await db.run(sql`CREATE INDEX \`pipeline_profiles_slug_idx\` ON \`pipeline_profiles\` (\`slug\`);`)
    await db.run(
      sql`CREATE INDEX \`pipeline_profiles_updated_at_idx\` ON \`pipeline_profiles\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`pipeline_profiles_created_at_idx\` ON \`pipeline_profiles\` (\`created_at\`);`,
    )
    await db.run(sql`
      CREATE UNIQUE INDEX \`pipeline_profiles_tenant_slug_unique\`
      ON \`pipeline_profiles\` (\`tenant_id\`, \`slug\`);
    `)
  }

  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (!relCols.some((c) => c.name === 'pipeline_profiles_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`pipeline_profiles_id\` integer REFERENCES pipeline_profiles(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_pipeline_profiles_id_idx\` ON \`payload_locked_documents_rels\` (\`pipeline_profiles_id\`);`,
    )
  }

  const siteCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!siteCols.some((c) => c.name === 'pipeline_profile_id')) {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`pipeline_profile_id\` integer REFERENCES pipeline_profiles(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`sites_pipeline_profile_id_idx\` ON \`sites\` (\`pipeline_profile_id\`);`,
    )
  }

  const articleCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('articles')`)
  if (!articleCols.some((c) => c.name === 'pipeline_profile_id')) {
    await db.run(
      sql`ALTER TABLE \`articles\` ADD \`pipeline_profile_id\` integer REFERENCES pipeline_profiles(id) ON UPDATE no action ON DELETE set null;`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`articles_pipeline_profile_id_idx\` ON \`articles\` (\`pipeline_profile_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('Migration 20260814_120000_pipeline_profiles is irreversible; restore from backup instead.')
}
