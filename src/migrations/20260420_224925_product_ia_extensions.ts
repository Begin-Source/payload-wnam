import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`social_platforms\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`status\` text DEFAULT 'active' NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`social_platforms_tenant_idx\` ON \`social_platforms\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`social_platforms_slug_idx\` ON \`social_platforms\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`social_platforms_updated_at_idx\` ON \`social_platforms\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`social_platforms_created_at_idx\` ON \`social_platforms\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`social_accounts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`platform_id\` integer NOT NULL,
  	\`site_id\` integer,
  	\`handle\` text NOT NULL,
  	\`status\` text DEFAULT 'active' NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`platform_id\`) REFERENCES \`social_platforms\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`social_accounts_tenant_idx\` ON \`social_accounts\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`social_accounts_platform_idx\` ON \`social_accounts\` (\`platform_id\`);`)
  await db.run(sql`CREATE INDEX \`social_accounts_site_idx\` ON \`social_accounts\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`social_accounts_updated_at_idx\` ON \`social_accounts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`social_accounts_created_at_idx\` ON \`social_accounts\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`rankings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`keyword_id\` integer,
  	\`site_id\` integer,
  	\`search_query\` text NOT NULL,
  	\`serp_position\` numeric,
  	\`serp_url\` text,
  	\`captured_at\` text NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`keyword_id\`) REFERENCES \`keywords\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`rankings_tenant_idx\` ON \`rankings\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`rankings_keyword_idx\` ON \`rankings\` (\`keyword_id\`);`)
  await db.run(sql`CREATE INDEX \`rankings_site_idx\` ON \`rankings\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`rankings_updated_at_idx\` ON \`rankings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`rankings_created_at_idx\` ON \`rankings\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`knowledge_base\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`slug\` text,
  	\`site_id\` integer,
  	\`body\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`knowledge_base_tenant_idx\` ON \`knowledge_base\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_slug_idx\` ON \`knowledge_base\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_site_idx\` ON \`knowledge_base\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_updated_at_idx\` ON \`knowledge_base\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_created_at_idx\` ON \`knowledge_base\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`knowledge_base_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`knowledge_base\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`knowledge_base_rels_order_idx\` ON \`knowledge_base_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_rels_parent_idx\` ON \`knowledge_base_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_rels_path_idx\` ON \`knowledge_base_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_base_rels_categories_id_idx\` ON \`knowledge_base_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE TABLE \`audit_logs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`action\` text NOT NULL,
  	\`collection_slug\` text,
  	\`document_id\` text,
  	\`actor_id\` integer,
  	\`occurred_at\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`actor_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`audit_logs_tenant_idx\` ON \`audit_logs\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_actor_idx\` ON \`audit_logs\` (\`actor_id\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_updated_at_idx\` ON \`audit_logs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`audit_logs_created_at_idx\` ON \`audit_logs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`announcements\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`body\` text NOT NULL,
  	\`is_active\` integer DEFAULT true,
  	\`starts_at\` text,
  	\`ends_at\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`ALTER TABLE \`users\` ADD \`team_lead_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`users_team_lead_idx\` ON \`users\` (\`team_lead_id\`);`)
  await db.run(sql`ALTER TABLE \`commissions\` ADD \`recipient_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`commissions_recipient_idx\` ON \`commissions\` (\`recipient_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_base_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_base_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_base_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_base_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`rankings_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`rankings_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`rankings_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`rankings_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`social_platforms_id\` integer REFERENCES social_platforms(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`social_accounts_id\` integer REFERENCES social_accounts(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`rankings_id\` integer REFERENCES rankings(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`knowledge_base_id\` integer REFERENCES knowledge_base(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`audit_logs_id\` integer REFERENCES audit_logs(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_social_platforms_id_idx\` ON \`payload_locked_documents_rels\` (\`social_platforms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_social_accounts_id_idx\` ON \`payload_locked_documents_rels\` (\`social_accounts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_rankings_id_idx\` ON \`payload_locked_documents_rels\` (\`rankings_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_knowledge_base_id_idx\` ON \`payload_locked_documents_rels\` (\`knowledge_base_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_audit_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`audit_logs_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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
  	\`categories_id\` integer,
  	\`media_id\` integer,
  	\`posts_id\` integer,
  	\`keywords_id\` integer,
  	\`workflow_jobs_id\` integer,
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
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`keywords_id\`) REFERENCES \`keywords\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`workflow_jobs_id\`) REFERENCES \`workflow_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`site_quotas_id\`) REFERENCES \`site_quotas\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`affiliate_networks_id\`) REFERENCES \`affiliate_networks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`offers_id\`) REFERENCES \`offers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`click_events_id\`) REFERENCES \`click_events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`commissions_id\`) REFERENCES \`commissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "tenants_id", "site_blueprints_id", "sites_id", "users_id", "categories_id", "media_id", "posts_id", "keywords_id", "workflow_jobs_id", "site_quotas_id", "affiliate_networks_id", "offers_id", "click_events_id", "commissions_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "tenants_id", "site_blueprints_id", "sites_id", "users_id", "categories_id", "media_id", "posts_id", "keywords_id", "workflow_jobs_id", "site_quotas_id", "affiliate_networks_id", "offers_id", "click_events_id", "commissions_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_keywords_id_idx\` ON \`payload_locked_documents_rels\` (\`keywords_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_workflow_jobs_id_idx\` ON \`payload_locked_documents_rels\` (\`workflow_jobs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_site_quotas_id_idx\` ON \`payload_locked_documents_rels\` (\`site_quotas_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_affiliate_networks_id_idx\` ON \`payload_locked_documents_rels\` (\`affiliate_networks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_offers_id_idx\` ON \`payload_locked_documents_rels\` (\`offers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_click_events_id_idx\` ON \`payload_locked_documents_rels\` (\`click_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commissions_id_idx\` ON \`payload_locked_documents_rels\` (\`commissions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_base_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_base_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_base_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_base_delete\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`rankings_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`rankings_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`rankings_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`rankings_delete\`;`)
  await db.run(sql`ALTER TABLE \`commissions\` DROP COLUMN \`recipient_id\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`team_lead_id\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`knowledge_base_rels\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`knowledge_base\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`audit_logs\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`rankings\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`social_accounts\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`social_platforms\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`announcements\`;`)
}
