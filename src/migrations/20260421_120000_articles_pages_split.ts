import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Split `posts` (post_type article|page) into `articles` and `pages`.
 * Migrates workflow_jobs.post_id → article_id | page_id, locked_documents_rels, MCP key columns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)

  await db.run(sql`CREATE TABLE \`articles\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`slug\` text,
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
  );`)
  await db.run(sql`CREATE TABLE \`pages\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`title\` text NOT NULL,
  	\`slug\` text,
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
  );`)

  await db.run(
    sql`INSERT INTO \`articles\` SELECT \`id\`, \`tenant_id\`, \`title\`, \`slug\`, \`site_id\`, \`featured_image_id\`, \`body\`, \`status\`, \`published_at\`, \`excerpt\`, \`updated_at\`, \`created_at\` FROM \`posts\` WHERE \`post_type\` = 'article';`,
  )
  await db.run(
    sql`INSERT INTO \`pages\` SELECT \`id\`, \`tenant_id\`, \`title\`, \`slug\`, \`site_id\`, \`featured_image_id\`, \`body\`, \`status\`, \`published_at\`, \`excerpt\`, \`updated_at\`, \`created_at\` FROM \`posts\` WHERE \`post_type\` = 'page';`,
  )

  await db.run(sql`CREATE INDEX \`articles_tenant_idx\` ON \`articles\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`articles_slug_idx\` ON \`articles\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`articles_site_idx\` ON \`articles\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`articles_featured_image_idx\` ON \`articles\` (\`featured_image_id\`);`)
  await db.run(sql`CREATE INDEX \`articles_updated_at_idx\` ON \`articles\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`articles_created_at_idx\` ON \`articles\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`pages_tenant_idx\` ON \`pages\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_slug_idx\` ON \`pages\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`pages_site_idx\` ON \`pages\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_featured_image_idx\` ON \`pages\` (\`featured_image_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_updated_at_idx\` ON \`pages\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`pages_created_at_idx\` ON \`pages\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`articles_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`articles\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE TABLE \`pages_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(
    sql`INSERT INTO \`articles_rels\` SELECT pr.\`id\`, pr.\`order\`, pr.\`parent_id\`, pr.\`path\`, pr.\`categories_id\` FROM \`posts_rels\` pr INNER JOIN \`posts\` p ON pr.\`parent_id\` = p.\`id\` WHERE p.\`post_type\` = 'article';`,
  )
  await db.run(
    sql`INSERT INTO \`pages_rels\` SELECT pr.\`id\`, pr.\`order\`, pr.\`parent_id\`, pr.\`path\`, pr.\`categories_id\` FROM \`posts_rels\` pr INNER JOIN \`posts\` p ON pr.\`parent_id\` = p.\`id\` WHERE p.\`post_type\` = 'page';`,
  )

  await db.run(sql`CREATE INDEX \`articles_rels_order_idx\` ON \`articles_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`articles_rels_parent_idx\` ON \`articles_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`articles_rels_path_idx\` ON \`articles_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`articles_rels_categories_id_idx\` ON \`articles_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_order_idx\` ON \`pages_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_parent_idx\` ON \`pages_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_path_idx\` ON \`pages_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_categories_id_idx\` ON \`pages_rels\` (\`categories_id\`);`)

  await db.run(sql`CREATE TABLE \`__new_workflow_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`label\` text NOT NULL,
  	\`job_type\` text DEFAULT 'custom' NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`site_id\` integer,
  	\`article_id\` integer,
  	\`page_id\` integer,
  	\`input\` text,
  	\`output\` text,
  	\`started_at\` text,
  	\`completed_at\` text,
  	\`error_message\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`site_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`article_id\`) REFERENCES \`articles\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(
    sql`INSERT INTO \`__new_workflow_jobs\` (\`id\`, \`tenant_id\`, \`label\`, \`job_type\`, \`status\`, \`site_id\`, \`article_id\`, \`page_id\`, \`input\`, \`output\`, \`started_at\`, \`completed_at\`, \`error_message\`, \`updated_at\`, \`created_at\`)
    SELECT w.\`id\`, w.\`tenant_id\`, w.\`label\`, w.\`job_type\`, w.\`status\`, w.\`site_id\`,
      CASE WHEN p.\`post_type\` = 'article' THEN w.\`post_id\` ELSE NULL END,
      CASE WHEN p.\`post_type\` = 'page' THEN w.\`post_id\` ELSE NULL END,
      w.\`input\`, w.\`output\`, w.\`started_at\`, w.\`completed_at\`, w.\`error_message\`, w.\`updated_at\`, w.\`created_at\`
    FROM \`workflow_jobs\` w
    LEFT JOIN \`posts\` p ON w.\`post_id\` = p.\`id\`;`,
  )
  await db.run(sql`DROP TABLE \`workflow_jobs\`;`)
  await db.run(sql`ALTER TABLE \`__new_workflow_jobs\` RENAME TO \`workflow_jobs\`;`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_tenant_idx\` ON \`workflow_jobs\` (\`tenant_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_site_idx\` ON \`workflow_jobs\` (\`site_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_article_idx\` ON \`workflow_jobs\` (\`article_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_page_idx\` ON \`workflow_jobs\` (\`page_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_updated_at_idx\` ON \`workflow_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`workflow_jobs_created_at_idx\` ON \`workflow_jobs\` (\`created_at\`);`)

  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`articles_id\` integer REFERENCES articles(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`pages_id\` integer REFERENCES pages(id);`)
  await db.run(
    sql`UPDATE \`payload_locked_documents_rels\` SET \`articles_id\` = \`posts_id\` WHERE \`posts_id\` IS NOT NULL AND \`posts_id\` IN (SELECT \`id\` FROM \`posts\` WHERE \`post_type\` = 'article');`,
  )
  await db.run(
    sql`UPDATE \`payload_locked_documents_rels\` SET \`pages_id\` = \`posts_id\` WHERE \`posts_id\` IS NOT NULL AND \`posts_id\` IN (SELECT \`id\` FROM \`posts\` WHERE \`post_type\` = 'page');`,
  )
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_posts_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`posts_id\`;`)
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_articles_id_idx\` ON \`payload_locked_documents_rels\` (\`articles_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`,
  )

  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`articles_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`articles_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`articles_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`articles_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`pages_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`pages_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`pages_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`pages_delete\` integer DEFAULT false;`)
  await db.run(
    sql`UPDATE \`payload_mcp_api_keys\` SET
      \`articles_find\` = \`posts_find\`, \`articles_create\` = \`posts_create\`, \`articles_update\` = \`posts_update\`, \`articles_delete\` = \`posts_delete\`,
      \`pages_find\` = \`posts_find\`, \`pages_create\` = \`posts_create\`, \`pages_update\` = \`posts_update\`, \`pages_delete\` = \`posts_delete\`;`,
  )
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`posts_delete\`;`)

  await db.run(sql`DROP TABLE IF EXISTS \`posts_rels\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`posts\`;`)

  await db.run(sql`PRAGMA foreign_keys=ON;`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260421_120000_articles_pages_split is irreversible without manual data remapping (articles/pages id spaces overlap). Restore from backup instead.',
  )
}
