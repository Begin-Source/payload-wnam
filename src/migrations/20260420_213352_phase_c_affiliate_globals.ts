import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`affiliate_networks\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`website_url\` text,
  	\`status\` text DEFAULT 'active' NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`affiliate_networks_tenant_idx\` ON \`affiliate_networks\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`affiliate_networks_slug_idx\` ON \`affiliate_networks\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`affiliate_networks_updated_at_idx\` ON \`affiliate_networks\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`affiliate_networks_created_at_idx\` ON \`affiliate_networks\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`offers\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`slug\` text,
  	\`network_id\` integer NOT NULL,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`external_id\` text,
  	\`target_url\` text,
  	\`commission_notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`network_id\`) REFERENCES \`affiliate_networks\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`offers_tenant_idx\` ON \`offers\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`offers_slug_idx\` ON \`offers\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`offers_network_idx\` ON \`offers\` (\`network_id\`);`)
  await db.run(sql`CREATE INDEX \`offers_updated_at_idx\` ON \`offers\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`offers_created_at_idx\` ON \`offers\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`offers_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`sites_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`offers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sites_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`offers_rels_order_idx\` ON \`offers_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`offers_rels_parent_idx\` ON \`offers_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`offers_rels_path_idx\` ON \`offers_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`offers_rels_sites_id_idx\` ON \`offers_rels\` (\`sites_id\`);`)
  await db.run(sql`CREATE TABLE \`click_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`occurred_at\` text NOT NULL,
  	\`event_type\` text DEFAULT 'click' NOT NULL,
  	\`site_id\` integer,
  	\`offer_id\` integer,
  	\`destination_url\` text,
  	\`referrer\` text,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`offer_id\`) REFERENCES \`offers\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`click_events_tenant_idx\` ON \`click_events\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`click_events_site_idx\` ON \`click_events\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`click_events_offer_idx\` ON \`click_events\` (\`offer_id\`);`)
  await db.run(sql`CREATE INDEX \`click_events_updated_at_idx\` ON \`click_events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`click_events_created_at_idx\` ON \`click_events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`commissions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`amount\` numeric NOT NULL,
  	\`currency\` text DEFAULT 'USD' NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`offer_id\` integer,
  	\`site_id\` integer,
  	\`period_start\` text,
  	\`period_end\` text,
  	\`paid_at\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`offer_id\`) REFERENCES \`offers\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`commissions_tenant_idx\` ON \`commissions\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`commissions_offer_idx\` ON \`commissions\` (\`offer_id\`);`)
  await db.run(sql`CREATE INDEX \`commissions_site_idx\` ON \`commissions\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`commissions_updated_at_idx\` ON \`commissions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`commissions_created_at_idx\` ON \`commissions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`commission_rules\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`rules\` text,
  	\`notes\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`quota_rules\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`rules\` text,
  	\`notes\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_networks_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_networks_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_networks_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_networks_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`offers_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`offers_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`offers_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`offers_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`affiliate_networks_id\` integer REFERENCES affiliate_networks(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`offers_id\` integer REFERENCES offers(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`click_events_id\` integer REFERENCES click_events(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commissions_id\` integer REFERENCES commissions(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_affiliate_networks_id_idx\` ON \`payload_locked_documents_rels\` (\`affiliate_networks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_offers_id_idx\` ON \`payload_locked_documents_rels\` (\`offers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_click_events_id_idx\` ON \`payload_locked_documents_rels\` (\`click_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commissions_id_idx\` ON \`payload_locked_documents_rels\` (\`commissions_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`commissions\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`click_events\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`offers_rels\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`offers\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`affiliate_networks\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`commission_rules\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`quota_rules\`;`)
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
  	\`payload_mcp_api_keys_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tenants_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`site_blueprints_id\`) REFERENCES \`site_blueprints\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sites_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`site_quotas_id\`) REFERENCES \`site_quotas\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "tenants_id", "site_blueprints_id", "sites_id", "users_id", "media_id", "site_quotas_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "tenants_id", "site_blueprints_id", "sites_id", "users_id", "media_id", "site_quotas_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`affiliate_networks_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`affiliate_networks_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`affiliate_networks_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`affiliate_networks_delete\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`offers_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`offers_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`offers_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`offers_delete\`;`)
}
