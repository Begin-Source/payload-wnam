import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`site_blueprints\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`description\` text,
  	\`template_config\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`site_blueprints_tenant_idx\` ON \`site_blueprints\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`site_blueprints_slug_idx\` ON \`site_blueprints\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`site_blueprints_updated_at_idx\` ON \`site_blueprints\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`site_blueprints_created_at_idx\` ON \`site_blueprints\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`sites\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`primary_domain\` text NOT NULL,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`blueprint_id\` integer,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`blueprint_id\`) REFERENCES \`site_blueprints\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`sites_tenant_idx\` ON \`sites\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`sites_slug_idx\` ON \`sites\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`sites_blueprint_idx\` ON \`sites\` (\`blueprint_id\`);`)
  await db.run(sql`CREATE INDEX \`sites_updated_at_idx\` ON \`sites\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`sites_created_at_idx\` ON \`sites\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`sites_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`sites_rels_order_idx\` ON \`sites_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`sites_rels_parent_idx\` ON \`sites_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`sites_rels_path_idx\` ON \`sites_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`sites_rels_users_id_idx\` ON \`sites_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`site_quotas\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`site_id\` integer NOT NULL,
  	\`max_published_pages\` numeric DEFAULT 0,
  	\`max_monthly_ai_runs\` numeric DEFAULT 0,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`site_quotas_tenant_idx\` ON \`site_quotas\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`site_quotas_site_idx\` ON \`site_quotas\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`site_quotas_updated_at_idx\` ON \`site_quotas\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`site_quotas_created_at_idx\` ON \`site_quotas\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`sites_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`sites_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`sites_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`sites_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`site_blueprints_id\` integer REFERENCES site_blueprints(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`sites_id\` integer REFERENCES sites(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`site_quotas_id\` integer REFERENCES site_quotas(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_site_blueprints_id_idx\` ON \`payload_locked_documents_rels\` (\`site_blueprints_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_sites_id_idx\` ON \`payload_locked_documents_rels\` (\`sites_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_site_quotas_id_idx\` ON \`payload_locked_documents_rels\` (\`site_quotas_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`site_blueprints\`;`)
  await db.run(sql`DROP TABLE \`sites\`;`)
  await db.run(sql`DROP TABLE \`sites_rels\`;`)
  await db.run(sql`DROP TABLE \`site_quotas\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`tenants_id\` integer,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`payload_mcp_api_keys_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tenants_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "tenants_id", "users_id", "media_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "tenants_id", "users_id", "media_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_tenants_id_idx\` ON \`payload_locked_documents_rels\` (\`tenants_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`sites_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`sites_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`sites_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`sites_delete\`;`)
}
