import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const addCol = async (ddl: string) => {
    try {
      await db.run(sql.raw(ddl))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  await addCol(
    `ALTER TABLE \`sites\` ADD \`public_locale_codes\` text DEFAULT '["zh","en"]';`,
  )
  await addCol(`ALTER TABLE \`sites\` ADD \`default_public_locale\` text DEFAULT 'en';`)

  await db.run(
    sql.raw(
      `UPDATE \`sites\` SET \`public_locale_codes\` = '["zh","en"]' WHERE \`public_locale_codes\` IS NULL OR trim(\`public_locale_codes\`) = '';`,
    ),
  )
  await db.run(
    sql.raw(
      `UPDATE \`sites\` SET \`default_public_locale\` = 'en' WHERE \`default_public_locale\` IS NULL OR trim(\`default_public_locale\`) = '';`,
    ),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
