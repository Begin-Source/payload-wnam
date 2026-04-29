import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Retire `landing-templates` and `site-t1-locales`; Template1 copy moves to `site_blueprints.t1_locale_json`.
 * Nulls `sites.landing_template_id`, drops `landing_templates` + `site_t1_locales`, removes FK columns where supported.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(`ALTER TABLE \`site_blueprints\` ADD \`t1_locale_json\` text;`),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }

  // Prefer per-site T1 row when present; else landing_templates.t1_locale_json for that site’s chosen template
  const tables = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table'`)
  const hasSt1 = tables.some((t) => t.name === 'site_t1_locales')
  const hasLt = tables.some((t) => t.name === 'landing_templates')

  if (hasSt1) {
    await db.run(sql`
      UPDATE site_blueprints
      SET t1_locale_json = (
        SELECT st.t1_locale_json
        FROM site_t1_locales st
        INNER JOIN sites s ON s.id = st.site_id
        WHERE s.blueprint_id = site_blueprints.id
          AND st.t1_locale_json IS NOT NULL
          AND trim(st.t1_locale_json) != ''
        LIMIT 1
      )
      WHERE id IN (SELECT s.blueprint_id FROM sites s WHERE s.blueprint_id IS NOT NULL);
    `)
  }

  if (hasLt) {
    await db.run(sql`
      UPDATE site_blueprints
      SET t1_locale_json = (
        SELECT lt.t1_locale_json
        FROM sites s
        INNER JOIN landing_templates lt ON lt.id = s.landing_template_id
        WHERE s.blueprint_id = site_blueprints.id
          AND (site_blueprints.t1_locale_json IS NULL OR trim(site_blueprints.t1_locale_json) = '')
          AND lt.t1_locale_json IS NOT NULL
          AND trim(lt.t1_locale_json) != ''
        LIMIT 1
      )
      WHERE id IN (SELECT s.blueprint_id FROM sites s WHERE s.blueprint_id IS NOT NULL);
    `)
  }

  const siteCols = await db.all<{ name: string }>(sql`PRAGMA table_info('sites')`)
  if (siteCols.some((c) => c.name === 'landing_template_id')) {
    await db.run(sql`UPDATE sites SET landing_template_id = NULL WHERE 1=1`)
  }

  const relCols = await db.all<{ name: string }>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'site_t1_locales_id')) {
    try {
      await db.run(
        sql`UPDATE payload_locked_documents_rels SET site_t1_locales_id = NULL WHERE 1=1`,
      )
    } catch {
      /* ignore */
    }
  }
  if (relCols.some((c) => c.name === 'landing_templates_id')) {
    try {
      await db.run(
        sql`UPDATE payload_locked_documents_rels SET landing_templates_id = NULL WHERE 1=1`,
      )
    } catch {
      /* ignore */
    }
  }

  if (hasSt1) {
    await db.run(sql`DROP TABLE IF EXISTS site_t1_locales;`)
  }
  if (hasLt) {
    await db.run(sql`DROP TABLE IF EXISTS landing_templates;`)
  }

  const dropCol = async (table: string, col: string) => {
    try {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\`;`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('no such column') && !msg.includes('error in index')) {
        // Old SQLite: leave orphan column; Payload schema must omit the field
      }
    }
  }
  if (siteCols.some((c) => c.name === 'landing_template_id')) {
    await dropCol('sites', 'landing_template_id')
  }
  if (relCols.some((c) => c.name === 'site_t1_locales_id')) {
    await dropCol('payload_locked_documents_rels', 'site_t1_locales_id')
  }
  if (relCols.some((c) => c.name === 'landing_templates_id')) {
    await dropCol('payload_locked_documents_rels', 'landing_templates_id')
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
