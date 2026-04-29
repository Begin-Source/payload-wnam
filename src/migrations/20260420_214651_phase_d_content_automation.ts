import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`description\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`categories_tenant_idx\` ON \`categories\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`categories_slug_idx\` ON \`categories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`categories_updated_at_idx\` ON \`categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`categories_created_at_idx\` ON \`categories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`posts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`slug\` text,
  	\`post_type\` text DEFAULT 'article' NOT NULL,
  	\`site_id\` integer,
  	\`featured_image_id\` integer,
  	\`body\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`published_at\` text,
  	\`excerpt\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`featured_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_tenant_idx\` ON \`posts\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_slug_idx\` ON \`posts\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`posts_site_idx\` ON \`posts\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_featured_image_idx\` ON \`posts\` (\`featured_image_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_updated_at_idx\` ON \`posts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`posts_created_at_idx\` ON \`posts\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`posts_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`posts_rels_order_idx\` ON \`posts_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_parent_idx\` ON \`posts_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_path_idx\` ON \`posts_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`posts_rels_categories_id_idx\` ON \`posts_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE TABLE \`keywords\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`term\` text NOT NULL,
  	\`slug\` text,
  	\`site_id\` integer,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`keywords_tenant_idx\` ON \`keywords\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`keywords_slug_idx\` ON \`keywords\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`keywords_site_idx\` ON \`keywords\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`keywords_updated_at_idx\` ON \`keywords\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`keywords_created_at_idx\` ON \`keywords\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`workflow_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`label\` text NOT NULL,
  	\`job_type\` text DEFAULT 'custom' NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`site_id\` integer,
  	\`post_id\` integer,
  	\`input\` text,
  	\`output\` text,
  	\`started_at\` text,
  	\`completed_at\` text,
  	\`error_message\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`workflow_jobs_tenant_idx\` ON \`workflow_jobs\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_site_idx\` ON \`workflow_jobs\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_post_idx\` ON \`workflow_jobs\` (\`post_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_updated_at_idx\` ON \`workflow_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_created_at_idx\` ON \`workflow_jobs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`admin_branding\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`brand_name\` text,
  	\`logo_id\` integer,
  	\`primary_color\` text,
  	\`support_email\` text,
  	\`notes\` text,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`admin_branding_logo_idx\` ON \`admin_branding\` (\`logo_id\`);`)
  await db.run(sql`CREATE TABLE \`llm_prompts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`default_model\` text,
  	\`temperature\` numeric DEFAULT 0.7,
  	\`global_system_prompt\` text,
  	\`api_notes\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`prompt_library\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`prompt_library_entries\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`body\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`prompt_library\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`prompt_library_entries_order_idx\` ON \`prompt_library_entries\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`prompt_library_entries_parent_id_idx\` ON \`prompt_library_entries\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`categories_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`categories_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`categories_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`categories_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`posts_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`posts_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`posts_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`posts_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`keywords_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`keywords_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`keywords_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`keywords_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`workflow_jobs_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`workflow_jobs_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`workflow_jobs_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`workflow_jobs_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`categories_id\` integer REFERENCES categories(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`posts_id\` integer REFERENCES posts(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`keywords_id\` integer REFERENCES keywords(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`workflow_jobs_id\` integer REFERENCES workflow_jobs(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_keywords_id_idx\` ON \`payload_locked_documents_rels\` (\`keywords_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_workflow_jobs_id_idx\` ON \`payload_locked_documents_rels\` (\`workflow_jobs_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`workflow_jobs\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`posts_rels\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`posts\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`keywords\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`categories\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`admin_branding\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`llm_prompts\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`prompt_library_entries\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`prompt_library\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`tenants_id\` integer,
  	\`site_blueprints_id\` integer,
  	\`sites_id\` integer,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`site_quotas_id\` integer,
  	\`affiliate_networks_id\` integer,
  	\`offers_id\` integer,
  	\`click_events_id\` integer,
  	\`commissions_id\` integer,
  	\`payload_mcp_api_keys_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tenants_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`site_blueprints_id\`) REFERENCES \`site_blueprints\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sites_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`site_quotas_id\`) REFERENCES \`site_quotas\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`affiliate_networks_id\`) REFERENCES \`affiliate_networks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`offers_id\`) REFERENCES \`offers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`click_events_id\`) REFERENCES \`click_events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`commissions_id\`) REFERENCES \`commissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "tenants_id", "site_blueprints_id", "sites_id", "users_id", "media_id", "site_quotas_id", "affiliate_networks_id", "offers_id", "click_events_id", "commissions_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "tenants_id", "site_blueprints_id", "sites_id", "users_id", "media_id", "site_quotas_id", "affiliate_networks_id", "offers_id", "click_events_id", "commissions_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_tenants_id_idx\` ON \`payload_locked_documents_rels\` (\`tenants_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_site_blueprints_id_idx\` ON \`payload_locked_documents_rels\` (\`site_blueprints_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_sites_id_idx\` ON \`payload_locked_documents_rels\` (\`sites_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_site_quotas_id_idx\` ON \`payload_locked_documents_rels\` (\`site_quotas_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_affiliate_networks_id_idx\` ON \`payload_locked_documents_rels\` (\`affiliate_networks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_offers_id_idx\` ON \`payload_locked_documents_rels\` (\`offers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_click_events_id_idx\` ON \`payload_locked_documents_rels\` (\`click_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commissions_id_idx\` ON \`payload_locked_documents_rels\` (\`commissions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`categories_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`categories_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`categories_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`categories_delete\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_delete\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`keywords_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`keywords_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`keywords_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`keywords_delete\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`workflow_jobs_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`workflow_jobs_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`workflow_jobs_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`workflow_jobs_delete\`;`)
}
