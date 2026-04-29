import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

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

/**
 * SEO pipeline: new collections, PipelineSettings global, extended keywords/articles/workflow, etc.
 * Column names follow Payload toSnakeCase (e.g. impressions30d, skip_link_budget_check).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'keywords', [
    { name: 'volume', ddl: 'numeric' },
    { name: 'keyword_difficulty', ddl: 'numeric' },
    { name: 'cpc', ddl: 'numeric' },
    { name: 'trend', ddl: 'text' },
    { name: 'intent', ddl: 'text' },
    { name: 'geo_friendly', ddl: 'integer DEFAULT 0' },
    { name: 'serp_features', ddl: 'text' },
    { name: 'last_refreshed_at', ddl: 'text' },
    { name: 'opportunity_score', ddl: 'numeric' },
  ])
  await addColumns(db, 'keywords', [
    {
      name: 'pillar_id',
      ddl: 'integer REFERENCES keywords(id) ON UPDATE no action ON DELETE set null',
    },
  ])
  await addColumns(db, 'offers', [
    { name: 'amazon_asin', ddl: 'text' },
    { name: 'amazon_price_cents', ddl: 'numeric' },
    { name: 'amazon_currency', ddl: "text DEFAULT 'USD'" },
    { name: 'amazon_rating_avg', ddl: 'numeric' },
    { name: 'amazon_review_count', ddl: 'numeric' },
    { name: 'amazon_image_url', ddl: 'text' },
    { name: 'amazon_prime_eligible', ddl: 'integer DEFAULT 0' },
    { name: 'amazon_merchant_last_synced_at', ddl: 'text' },
    { name: 'amazon_merchant_raw', ddl: 'text' },
  ])
  await addColumns(db, 'rankings', [
    { name: 'raw_serp', ddl: 'text' },
    { name: 'change', ddl: 'numeric' },
    { name: 'is_ai_overview_hit', ddl: 'integer DEFAULT 0' },
  ])
  await addColumns(db, 'media', [{ name: 'asset_class', ddl: "text DEFAULT 'decorative'" }])
  await addColumns(db, 'site_quotas', [
    { name: 'daily_post_cap', ddl: 'numeric DEFAULT 3' },
    { name: 'monthly_token_budget_usd', ddl: 'numeric DEFAULT 50' },
    { name: 'monthly_images_budget_usd', ddl: 'numeric DEFAULT 30' },
    { name: 'monthly_dfs_credit_budget', ddl: 'numeric DEFAULT 100' },
    { name: 'usage_ytd', ddl: 'text' },
  ])
  await addColumns(db, 'knowledge_base', [
    { name: 'entry_type', ddl: 'text' },
    { name: 'skill_id', ddl: 'text' },
    { name: 'subject', ddl: 'text' },
    { name: 'summary', ddl: 'text' },
    { name: 'payload', ddl: 'text' },
    { name: 'severity', ddl: "text DEFAULT 'info'" },
    { name: 'expires_at', ddl: 'text' },
    { name: 'artifact_class', ddl: 'text' },
  ])
  await addColumns(db, 'site_blueprints', [
    { name: 'trust_assets_template', ddl: 'text' },
    { name: 'main_nav_template', ddl: 'text' },
    { name: 'footer_template', ddl: 'text' },
    { name: 'show_breadcrumb', ddl: 'integer DEFAULT 1' },
  ])
  await addColumns(db, 'prompt_library', [{ name: 'skill_overrides', ddl: 'text' }])
  await addColumns(db, 'workflow_jobs', [
    {
      name: 'parent_job_id',
      ddl: 'integer REFERENCES workflow_jobs(id) ON UPDATE no action ON DELETE set null',
    },
    { name: 'skill_id', ddl: 'text' },
    { name: 'handoff', ddl: 'text' },
    { name: 'content_brief_id', ddl: 'integer' },
    {
      name: 'pipeline_keyword_id',
      ddl: 'integer REFERENCES keywords(id) ON UPDATE no action ON DELETE set null',
    },
  ])

  // --- New global: pipeline_settings ---
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`pipeline_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tavily_enabled\` integer DEFAULT 1,
  	\`data_for_seo_enabled\` integer DEFAULT 1,
  	\`together_image_enabled\` integer DEFAULT 1,
  	\`default_llm_model\` text,
  	\`default_image_model\` text,
  	\`amazon_marketplace\` text,
  	\`default_locale\` text,
  	\`default_region\` text,
  	\`frugal_mode\` integer DEFAULT 0,
  	\`eeat_weights\` text,
  	\`llm_models_by_section\` text,
  	\`section_parallelism\` numeric DEFAULT 1,
  	\`section_parallel_whitelist\` text,
  	\`section_max_retry\` numeric DEFAULT 3,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`authors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`display_name\` text NOT NULL,
  	\`slug\` text,
  	\`role\` text,
  	\`headshot_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null,
  	\`bio_lexical\` text,
  	\`credentials\` text,
  	\`same_as\` text,
  	\`schema_person_json_ld\` text,
  	\`gdpr_lawful_basis\` text,
  	\`gdpr_region\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`authors_tenant_idx\` ON \`authors\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`authors_display_name_idx\` ON \`authors\` (\`display_name\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`authors_slug_idx\` ON \`authors\` (\`slug\`);`)
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`authors_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`authors_rels_order_idx\` ON \`authors_rels\` (\`order\`);`)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`authors_rels_parent_idx\` ON \`authors_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`authors_rels_path_idx\` ON \`authors_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`authors_rels_categories_id_idx\` ON \`authors_rels\` (\`categories_id\`);`,
  )

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`content_briefs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`primary_keyword_id\` integer REFERENCES keywords(id) ON UPDATE no action ON DELETE set null,
  	\`site_id\` integer REFERENCES sites(id) ON UPDATE no action ON DELETE set null,
  	\`intent_summary\` text,
  	\`outline\` text NOT NULL,
  	\`sources\` text,
  	\`target_word_count\` numeric,
  	\`competitors\` text,
  	\`people_also_ask\` text,
  	\`schema_hints\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`skill_id\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`content_briefs_tenant_idx\` ON \`content_briefs\` (\`tenant_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`content_briefs_primary_keyword_idx\` ON \`content_briefs\` (\`primary_keyword_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`content_briefs_site_idx\` ON \`content_briefs\` (\`site_id\`);`,
  )

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`serp_snapshots\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`search_query\` text,
  	\`keyword_id\` integer REFERENCES keywords(id) ON UPDATE no action ON DELETE set null,
  	\`site_id\` integer REFERENCES sites(id) ON UPDATE no action ON DELETE set null,
  	\`engine\` text,
  	\`location\` text,
  	\`device\` text,
  	\`captured_at\` text NOT NULL,
  	\`raw\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`serp_snapshots_keyword_idx\` ON \`serp_snapshots\` (\`keyword_id\`);`,
  )

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`original_evidence\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`kind\` text NOT NULL,
  	\`product_id\` integer REFERENCES offers(id) ON UPDATE no action ON DELETE set null,
  	\`article_id\` integer REFERENCES articles(id) ON UPDATE no action ON DELETE set null,
  	\`captured_at\` text,
  	\`captured_by_id\` integer REFERENCES users(id) ON UPDATE no action ON DELETE set null,
  	\`media_id\` integer NOT NULL REFERENCES media(id) ON UPDATE no action ON DELETE set null,
  	\`watermark_applied\` integer DEFAULT 0,
  	\`exif_preserved\` integer DEFAULT 1,
  	\`notes\` text,
  	\`verified_by_id\` integer REFERENCES users(id) ON UPDATE no action ON DELETE set null,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`page_link_graph\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`site_id\` integer REFERENCES sites(id) ON UPDATE no action ON DELETE set null,
  	\`from_collection\` text,
  	\`from_id\` text,
  	\`to_collection\` text,
  	\`to_id\` text,
  	\`to_external\` text,
  	\`anchor_text\` text,
  	\`anchor_type\` text,
  	\`location\` text,
  	\`context_snippet\` text,
  	\`rel\` text,
  	\`created_by\` text,
  	\`last_seen_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`page_link_graph_site_idx\` ON \`page_link_graph\` (\`site_id\`);`,
  )

  // Patch workflow content_brief_id FK to content_briefs (if SQLite allows: already integer only)
  await addColumns(db, 'articles', [
    { name: 'content_template', ddl: "text DEFAULT 'howto'" },
    { name: 'quality_score', ddl: 'numeric' },
    { name: 'eeat_check', ddl: 'text' },
    { name: 'schema_json_ld', ddl: 'text' },
    { name: 'veto_codes', ddl: 'text' },
    { name: 'section_summaries', ddl: 'text' },
    { name: 'meta_variants', ddl: 'text' },
    { name: 'lifecycle_stage', ddl: "text DEFAULT 'n_a'" },
    { name: 'probation_ends_at', ddl: 'text' },
    { name: 'best_position', ddl: 'numeric' },
    { name: 'current_position', ddl: 'numeric' },
    { name: 'impressions30d', ddl: 'numeric' },
    { name: 'clicks30d', ddl: 'numeric' },
    { name: 'next_action_at', ddl: 'text' },
    { name: 'optimization_history', ddl: 'text' },
    { name: 'skip_link_budget_check', ddl: 'integer DEFAULT 0' },
    { name: 'primary_keyword_id', ddl: 'integer REFERENCES keywords(id) ON UPDATE no action ON DELETE set null' },
    {
      name: 'source_brief_id',
      ddl: 'integer REFERENCES content_briefs(id) ON UPDATE no action ON DELETE set null',
    },
    { name: 'merged_into_id', ddl: 'integer REFERENCES articles(id) ON UPDATE no action ON DELETE set null' },
    { name: 'author_id', ddl: 'integer REFERENCES authors(id) ON UPDATE no action ON DELETE set null' },
    { name: 'reviewed_by_id', ddl: 'integer REFERENCES authors(id) ON UPDATE no action ON DELETE set null' },
  ])
  await addColumns(db, 'articles_rels', [
    { name: 'keywords_id', ddl: 'integer REFERENCES keywords(id) ON UPDATE no action ON DELETE cascade' },
  ])
  await addColumns(db, 'articles_rels', [
    { name: 'offers_id', ddl: 'integer REFERENCES offers(id) ON UPDATE no action ON DELETE cascade' },
  ])
  await addColumns(db, 'articles_rels', [
    {
      name: 'original_evidence_id',
      ddl: 'integer REFERENCES original_evidence(id) ON UPDATE no action ON DELETE cascade',
    },
  ])
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260430_120000_seo_pipeline_foundation: down not supported.')
}
