import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * 站点上落地/联盟/博客 override 已迁到「设计」；迁移中若设计列仍空则从 sites 抄入对应 site_blueprints 行
 *（同一 blueprint 多站点时子查询 `LIMIT 1` 只取其中一条的站点值），再删 sites 上旧列。
 */
const COPY_TEXT_PAIRS: { site: string; bp: string }[] = [
  { site: 'landing_browser_title', bp: 'design_browser_title' },
  { site: 'landing_site_name', bp: 'design_site_name' },
  { site: 'landing_tagline', bp: 'design_tagline' },
  { site: 'landing_logged_in_title', bp: 'design_logged_in_title' },
  { site: 'landing_logged_in_subtitle', bp: 'design_logged_in_subtitle' },
  { site: 'landing_footer_line', bp: 'design_footer_line' },
  { site: 'landing_cta_label', bp: 'design_cta_label' },
  { site: 'landing_bg_color', bp: 'design_bg_color' },
  { site: 'landing_text_color', bp: 'design_text_color' },
  { site: 'landing_muted_color', bp: 'design_muted_color' },
  { site: 'landing_cta_bg_color', bp: 'design_cta_bg_color' },
  { site: 'landing_cta_text_color', bp: 'design_cta_text_color' },
  { site: 'landing_font_preset', bp: 'design_font_preset' },
  { site: 'review_hub_tagline', bp: 'design_review_hub_tagline' },
  { site: 'affiliate_disclosure_line', bp: 'design_affiliate_disclosure_line' },
  { site: 'footer_resource_links', bp: 'design_footer_resource_links' },
  { site: 'landing_blog_primary_color', bp: 'design_blog_primary_color' },
  { site: 'landing_blog_accent_color', bp: 'design_blog_accent_color' },
  { site: 'landing_blog_content_bg_color', bp: 'design_blog_content_bg_color' },
  { site: 'landing_blog_card_bg_color', bp: 'design_blog_card_bg_color' },
  { site: 'landing_blog_header_text_color', bp: 'design_blog_header_text_color' },
  { site: 'landing_blog_heading_color', bp: 'design_blog_heading_color' },
  { site: 'landing_blog_body_color', bp: 'design_blog_body_color' },
  { site: 'landing_about_title', bp: 'design_about_title' },
  { site: 'landing_about_bio', bp: 'design_about_bio' },
  { site: 'landing_about_cta_label', bp: 'design_about_cta_label' },
  { site: 'landing_about_cta_href', bp: 'design_about_cta_href' },
]

const SITES_DROP_COLUMNS: string[] = [
  'landing_browser_title',
  'landing_site_name',
  'landing_tagline',
  'landing_logged_in_title',
  'landing_logged_in_subtitle',
  'landing_footer_line',
  'landing_cta_label',
  'landing_bg_color',
  'landing_text_color',
  'landing_muted_color',
  'landing_cta_bg_color',
  'landing_cta_text_color',
  'landing_font_preset',
  'review_hub_tagline',
  'affiliate_disclosure_line',
  'footer_resource_links',
  'landing_blog_primary_color',
  'landing_blog_accent_color',
  'landing_blog_content_bg_color',
  'landing_blog_card_bg_color',
  'landing_blog_header_text_color',
  'landing_blog_heading_color',
  'landing_blog_body_color',
  'landing_about_title',
  'landing_about_bio',
  'landing_about_image_id',
  'landing_about_cta_label',
  'landing_about_cta_href',
]

function dropCol(db: MigrateUpArgs['db'], table: string, col: string) {
  return db.run(sql.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\`;`))
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const sitesInfo = await db.all<{ name: string }>(sql`PRAGMA table_info('sites')`)
  const siteCols = new Set(sitesInfo.map((r) => r.name))

  for (const { site: siteCol, bp: bpCol } of COPY_TEXT_PAIRS) {
    if (!siteCols.has(siteCol) || !siteCols.has('blueprint_id')) continue
    const bpInfo = await db.all<{ name: string }>(sql`PRAGMA table_info('site_blueprints')`)
    if (!bpInfo.some((r) => r.name === bpCol)) continue
    try {
      const copySql =
        'UPDATE site_blueprints SET ' +
        bpCol +
        ' = ( SELECT s.' +
        siteCol +
        ' FROM sites s WHERE s.blueprint_id = site_blueprints.id AND s.' +
        siteCol +
        " IS NOT NULL AND trim(CAST(s." +
        siteCol +
        ' AS TEXT)) != ' +
        "''" +
        ' LIMIT 1 ) WHERE (site_blueprints.' +
        bpCol +
        ' IS NULL OR trim(CAST(site_blueprints.' +
        bpCol +
        " AS TEXT)) = '') AND id IN (SELECT DISTINCT blueprint_id FROM sites WHERE blueprint_id IS NOT NULL);"
      await db.run(sql.raw(copySql))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('no such') && !msg.includes('no column')) throw e
    }
  }

  if (siteCols.has('landing_about_image_id') && siteCols.has('blueprint_id')) {
    const bpInfo = await db.all<{ name: string }>(sql`PRAGMA table_info('site_blueprints')`)
    if (bpInfo.some((r) => r.name === 'design_about_image_id')) {
      try {
        const imgSql =
          'UPDATE site_blueprints SET design_about_image_id = ( SELECT s.landing_about_image_id FROM sites s WHERE s.blueprint_id = site_blueprints.id AND s.landing_about_image_id IS NOT NULL LIMIT 1 ) WHERE site_blueprints.design_about_image_id IS NULL AND id IN (SELECT DISTINCT blueprint_id FROM sites WHERE blueprint_id IS NOT NULL);'
        await db.run(sql.raw(imgSql))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('no such') && !msg.includes('no column')) throw e
      }
    }
  }

  for (const col of SITES_DROP_COLUMNS) {
    if (!siteCols.has(col)) continue
    try {
      await dropCol(db, 'sites', col)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('no such column') || msg.includes('error in index')) continue
      throw e
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
