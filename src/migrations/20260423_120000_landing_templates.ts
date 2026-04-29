import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `landing-templates` collection + `sites.landing_template_id` + design tweak columns on `site_blueprints`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`landing_templates\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`description\` text,
  	\`landing_browser_title\` text,
  	\`landing_site_name\` text,
  	\`landing_tagline\` text,
  	\`landing_logged_in_title\` text,
  	\`landing_logged_in_subtitle\` text,
  	\`landing_footer_line\` text,
  	\`landing_cta_label\` text,
  	\`landing_bg_color\` text,
  	\`landing_text_color\` text,
  	\`landing_muted_color\` text,
  	\`landing_cta_bg_color\` text,
  	\`landing_cta_text_color\` text,
  	\`landing_font_preset\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`landing_templates_tenant_idx\` ON \`landing_templates\` (\`tenant_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`landing_templates_slug_idx\` ON \`landing_templates\` (\`slug\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`landing_templates_updated_at_idx\` ON \`landing_templates\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`landing_templates_created_at_idx\` ON \`landing_templates\` (\`created_at\`);`,
  )

  const relCols = await db.all<{ name: string }>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (!relCols.some((c) => c.name === 'landing_templates_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`landing_templates_id\` integer REFERENCES landing_templates(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_landing_templates_id_idx\` ON \`payload_locked_documents_rels\` (\`landing_templates_id\`);`,
    )
  }

  try {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`landing_template_id\` integer REFERENCES landing_templates(id) ON UPDATE no action ON DELETE set null;`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`sites_landing_template_idx\` ON \`sites\` (\`landing_template_id\`);`,
    )
  } catch {
    /* index may already exist */
  }

  const blueprintDesignCols: { name: string; ddl: string }[] = [
    { name: 'design_browser_title', ddl: 'text' },
    { name: 'design_site_name', ddl: 'text' },
    { name: 'design_tagline', ddl: 'text' },
    { name: 'design_logged_in_title', ddl: 'text' },
    { name: 'design_logged_in_subtitle', ddl: 'text' },
    { name: 'design_footer_line', ddl: 'text' },
    { name: 'design_cta_label', ddl: 'text' },
    { name: 'design_bg_color', ddl: 'text' },
    { name: 'design_text_color', ddl: 'text' },
    { name: 'design_muted_color', ddl: 'text' },
    { name: 'design_cta_bg_color', ddl: 'text' },
    { name: 'design_cta_text_color', ddl: 'text' },
    { name: 'design_font_preset', ddl: 'text' },
  ]
  for (const { name, ddl } of blueprintDesignCols) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`site_blueprints\` ADD \`${name}\` ${ddl};`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`landing_templates\`;`)
  // Forward-only: sites / site_blueprints columns not dropped.
}
