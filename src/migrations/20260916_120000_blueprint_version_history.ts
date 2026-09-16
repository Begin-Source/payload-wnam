import { type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

// Generated from Payload 3.82.1 in the isolated Cloudflare D1 schema.
const ddl: string[] = [
  "CREATE TABLE IF NOT EXISTS `_site_blueprints_v` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`parent_id` integer,\n\t`version_tenant_id` integer,\n\t`version_name` text NOT NULL,\n\t`version_slug` text NOT NULL,\n\t`version_site_id` integer,\n\t`version_mirrored_site_layout` text DEFAULT 'template1',\n\t`version_design_workflow_status` text DEFAULT 'idle',\n\t`version_design_workflow_log` text,\n\t`version_design_workflow_last_error_code` text,\n\t`version_design_workflow_last_error_detail` text,\n\t`version_design_workflow_last_error_at` text,\n\t`version_description` text,\n\t`version_template_config` text,\n\t`version_design_browser_title` text,\n\t`version_design_site_name` text,\n\t`version_design_tagline` text,\n\t`version_design_logged_in_title` text,\n\t`version_design_logged_in_subtitle` text,\n\t`version_design_footer_line` text,\n\t`version_design_cta_label` text,\n\t`version_design_bg_color` text,\n\t`version_design_text_color` text,\n\t`version_design_muted_color` text,\n\t`version_design_cta_bg_color` text,\n\t`version_design_cta_text_color` text,\n\t`version_design_font_preset` text,\n\t`version_design_review_hub_tagline` text,\n\t`version_design_affiliate_disclosure_line` text,\n\t`version_design_footer_resource_links` text,\n\t`version_design_blog_primary_color` text,\n\t`version_design_blog_accent_color` text,\n\t`version_design_blog_content_bg_color` text,\n\t`version_design_blog_card_bg_color` text,\n\t`version_design_blog_header_text_color` text,\n\t`version_design_blog_heading_color` text,\n\t`version_design_blog_body_color` text,\n\t`version_design_about_title` text,\n\t`version_design_about_bio` text,\n\t`version_design_about_image_id` integer,\n\t`version_design_about_cta_label` text,\n\t`version_design_about_cta_href` text,\n\t`version_amz_site_config_json` text,\n\t`version_t1_locale_json` text DEFAULT '{}',\n\t`version_t2_locale_json` text DEFAULT '{}',\n\t`version_trust_assets_template` text,\n\t`version_main_nav_template` text,\n\t`version_footer_template` text,\n\t`version_show_breadcrumb` integer DEFAULT true,\n\t`version_updated_at` text,\n\t`version_created_at` text,\n\t`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n\t`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n\tFOREIGN KEY (`parent_id`) REFERENCES `site_blueprints`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`version_tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`version_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`version_design_about_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null\n)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_created_at_idx` ON `_site_blueprints_v` (`created_at`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_parent_idx` ON `_site_blueprints_v` (`parent_id`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_updated_at_idx` ON `_site_blueprints_v` (`updated_at`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_version_version_created_at_idx` ON `_site_blueprints_v` (`version_created_at`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_version_version_design_about_image_idx` ON `_site_blueprints_v` (`version_design_about_image_id`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_version_version_site_idx` ON `_site_blueprints_v` (`version_site_id`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_version_version_slug_idx` ON `_site_blueprints_v` (`version_slug`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_version_version_tenant_idx` ON `_site_blueprints_v` (`version_tenant_id`)",
  "CREATE INDEX IF NOT EXISTS `_site_blueprints_v_version_version_updated_at_idx` ON `_site_blueprints_v` (`version_updated_at`)"
]


export async function up({ db }: Pick<MigrateUpArgs, 'db'>): Promise<void> {
  for (const statement of ddl) await db.run(sql.raw(statement))
  const source = await db.all<{ name: string }>(sql.raw("PRAGMA table_info('site_blueprints')"))
  const versions = await db.all<{ name: string }>(sql.raw("PRAGMA table_info('_site_blueprints_v')"))
  const names = new Set(source.map(column => column.name))
  const copied = versions.map(column => column.name)
    .filter(name => name.startsWith('version_') && names.has(name.slice(8)))
  // Keep the pre-rollout design available before the first ordinary versioned update.
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
  await db.run(sql.raw(
    'INSERT INTO "_site_blueprints_v" ("parent_id", ' + copied.map(quote).join(', ') + ') ' +
    'SELECT s."id", ' + copied.map(name => 's.' + quote(name.slice(8))).join(', ') +
    ' FROM "site_blueprints" s WHERE NOT EXISTS ' +
    '(SELECT 1 FROM "_site_blueprints_v" v WHERE v."parent_id" = s."id")',
  ))
}

export async function down(): Promise<void> {
  // Retain additive history tables when rolling application code back.
}
