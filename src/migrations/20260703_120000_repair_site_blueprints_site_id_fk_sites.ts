import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Some environments rebuilt `sites` while leaving `site_blueprints.site_id` pointing at the
 * temporary backup table `sites_mig_old_20260629`. New rows then fail with SQLITE_CONSTRAINT
 * even when `sites.id` exists (e.g. site 9 in `sites` but not in the backup table).
 *
 * Rebuild `site_blueprints` with `site_id` → `sites(id)`; data and primary keys are preserved.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const rows = await db.all<{ sql: string | null }>(
    sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'site_blueprints'`,
  )
  const ddl = rows[0]?.sql
  if (!ddl || !ddl.includes('sites_mig_old_20260629')) return

  await db.run(sql`PRAGMA foreign_keys = OFF`)

  await db.run(sql.raw(`
CREATE TABLE \`__new_site_blueprints\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`tenant_id\` integer,
  \`name\` text NOT NULL,
  \`slug\` text NOT NULL,
  \`description\` text,
  \`template_config\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`site_id\` integer REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  \`design_browser_title\` text,
  \`design_site_name\` text,
  \`design_tagline\` text,
  \`design_logged_in_title\` text,
  \`design_logged_in_subtitle\` text,
  \`design_footer_line\` text,
  \`design_cta_label\` text,
  \`design_bg_color\` text,
  \`design_text_color\` text,
  \`design_muted_color\` text,
  \`design_cta_bg_color\` text,
  \`design_cta_text_color\` text,
  \`design_font_preset\` text,
  \`design_blog_primary_color\` text,
  \`design_blog_accent_color\` text,
  \`design_blog_content_bg_color\` text,
  \`design_blog_card_bg_color\` text,
  \`design_blog_header_text_color\` text,
  \`design_blog_heading_color\` text,
  \`design_blog_body_color\` text,
  \`design_about_title\` text,
  \`design_about_bio\` text,
  \`design_about_image_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null,
  \`design_about_cta_label\` text,
  \`design_about_cta_href\` text,
  \`trust_assets_template\` text,
  \`main_nav_template\` text,
  \`footer_template\` text,
  \`show_breadcrumb\` integer DEFAULT 1,
  \`t1_locale_json\` text,
  \`design_review_hub_tagline\` text,
  \`design_affiliate_disclosure_line\` text,
  \`design_footer_resource_links\` text,
  \`t2_locale_json\` text,
  \`mirrored_site_layout\` text DEFAULT 'template1',
  \`amz_site_config_json\` text,
  FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
)`))

  await db.run(
    sql`INSERT INTO \`__new_site_blueprints\` SELECT * FROM \`site_blueprints\``,
  )

  await db.run(sql`DROP INDEX IF EXISTS \`site_blueprints_tenant_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`site_blueprints_slug_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`site_blueprints_updated_at_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`site_blueprints_created_at_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`site_blueprints_site_idx\``)

  await db.run(sql`DROP TABLE \`site_blueprints\``)
  await db.run(sql`ALTER TABLE \`__new_site_blueprints\` RENAME TO \`site_blueprints\``)

  await db.run(
    sql`CREATE INDEX \`site_blueprints_tenant_idx\` ON \`site_blueprints\` (\`tenant_id\`)`,
  )
  await db.run(sql`CREATE INDEX \`site_blueprints_slug_idx\` ON \`site_blueprints\` (\`slug\`)`)
  await db.run(
    sql`CREATE INDEX \`site_blueprints_updated_at_idx\` ON \`site_blueprints\` (\`updated_at\`)`,
  )
  await db.run(
    sql`CREATE INDEX \`site_blueprints_created_at_idx\` ON \`site_blueprints\` (\`created_at\`)`,
  )
  await db.run(sql`CREATE INDEX \`site_blueprints_site_idx\` ON \`site_blueprints\` (\`site_id\`)`)

  await db.run(sql`PRAGMA foreign_keys = ON`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
