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
 * Blog shell + About fields on landing_templates, sites, site_blueprints, public_landing.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'landing_templates', [
    { name: 'blog_primary_color', ddl: 'text' },
    { name: 'blog_accent_color', ddl: 'text' },
    { name: 'blog_content_bg_color', ddl: 'text' },
    { name: 'blog_card_bg_color', ddl: 'text' },
    { name: 'blog_header_text_color', ddl: 'text' },
    { name: 'blog_heading_color', ddl: 'text' },
    { name: 'blog_body_color', ddl: 'text' },
    { name: 'about_title', ddl: 'text' },
    { name: 'about_bio', ddl: 'text' },
    { name: 'about_image_id', ddl: 'integer REFERENCES media(id) ON UPDATE no action ON DELETE set null' },
    { name: 'about_cta_label', ddl: 'text' },
    { name: 'about_cta_href', ddl: 'text' },
  ])

  await addColumns(db, 'sites', [
    { name: 'landing_blog_primary_color', ddl: 'text' },
    { name: 'landing_blog_accent_color', ddl: 'text' },
    { name: 'landing_blog_content_bg_color', ddl: 'text' },
    { name: 'landing_blog_card_bg_color', ddl: 'text' },
    { name: 'landing_blog_header_text_color', ddl: 'text' },
    { name: 'landing_blog_heading_color', ddl: 'text' },
    { name: 'landing_blog_body_color', ddl: 'text' },
    { name: 'landing_about_title', ddl: 'text' },
    { name: 'landing_about_bio', ddl: 'text' },
    {
      name: 'landing_about_image_id',
      ddl: 'integer REFERENCES media(id) ON UPDATE no action ON DELETE set null',
    },
    { name: 'landing_about_cta_label', ddl: 'text' },
    { name: 'landing_about_cta_href', ddl: 'text' },
  ])

  await addColumns(db, 'site_blueprints', [
    { name: 'design_blog_primary_color', ddl: 'text' },
    { name: 'design_blog_accent_color', ddl: 'text' },
    { name: 'design_blog_content_bg_color', ddl: 'text' },
    { name: 'design_blog_card_bg_color', ddl: 'text' },
    { name: 'design_blog_header_text_color', ddl: 'text' },
    { name: 'design_blog_heading_color', ddl: 'text' },
    { name: 'design_blog_body_color', ddl: 'text' },
    { name: 'design_about_title', ddl: 'text' },
    { name: 'design_about_bio', ddl: 'text' },
    {
      name: 'design_about_image_id',
      ddl: 'integer REFERENCES media(id) ON UPDATE no action ON DELETE set null',
    },
    { name: 'design_about_cta_label', ddl: 'text' },
    { name: 'design_about_cta_href', ddl: 'text' },
  ])

  await addColumns(db, 'public_landing', [
    { name: 'blog_primary_color', ddl: 'text' },
    { name: 'blog_accent_color', ddl: 'text' },
    { name: 'blog_content_bg_color', ddl: 'text' },
    { name: 'blog_card_bg_color', ddl: 'text' },
    { name: 'blog_header_text_color', ddl: 'text' },
    { name: 'blog_heading_color', ddl: 'text' },
    { name: 'blog_body_color', ddl: 'text' },
    { name: 'about_title', ddl: 'text' },
    { name: 'about_bio', ddl: 'text' },
    { name: 'about_image_id', ddl: 'integer REFERENCES media(id) ON UPDATE no action ON DELETE set null' },
    { name: 'about_cta_label', ddl: 'text' },
    { name: 'about_cta_href', ddl: 'text' },
  ])
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`) // no-op; forward-only column adds
}
