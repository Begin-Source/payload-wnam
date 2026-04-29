import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'design_review_hub_tagline', ddl: 'text' },
  { name: 'design_affiliate_disclosure_line', ddl: 'text' },
  { name: 'design_footer_resource_links', ddl: 'text' },
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { name, ddl } of COLUMNS) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`site_blueprints\` ADD \`${name}\` ${ddl};`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
