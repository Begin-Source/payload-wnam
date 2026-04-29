import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Empty-string date-like columns become Invalid Date in Drizzle read → RangeError: Invalid time value
 * when listing `pages`. Normalize to NULL. See site_pages_bundle_last_error_at, published_at.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`UPDATE \`pages\` SET \`site_pages_bundle_last_error_at\` = NULL
        WHERE \`site_pages_bundle_last_error_at\` IS NOT NULL
        AND TRIM(\`site_pages_bundle_last_error_at\`) = ''`,
  )
  await db.run(
    sql`UPDATE \`pages\` SET \`published_at\` = NULL
        WHERE \`published_at\` IS NOT NULL
        AND TRIM(\`published_at\`) = ''`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
