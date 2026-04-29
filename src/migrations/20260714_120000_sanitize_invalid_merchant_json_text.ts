import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Clear non-JSON text from json-backed columns when values don’t start with `{` or `[`.
 * Fixes admin list/detail crashes (`Unexpected token 'm', "merchant_s"... is not valid JSON`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    UPDATE \`offers\`
    SET \`merchant_slot_last_payload\` = NULL
    WHERE \`merchant_slot_last_payload\` IS NOT NULL
      AND LENGTH(TRIM(COALESCE(\`merchant_slot_last_payload\`, ''))) > 0
      AND SUBSTR(TRIM(\`merchant_slot_last_payload\`), 1, 1) NOT IN ('{', '[')
  `)
  await db.run(sql`
    UPDATE \`offers\`
    SET \`amazon_merchant_raw\` = NULL
    WHERE \`amazon_merchant_raw\` IS NOT NULL
      AND LENGTH(TRIM(COALESCE(\`amazon_merchant_raw\`, ''))) > 0
      AND SUBSTR(TRIM(\`amazon_merchant_raw\`), 1, 1) NOT IN ('{', '[')
  `)
  await db.run(sql`
    UPDATE \`categories\`
    SET \`merchant_offer_fetch_last_summary\` = NULL
    WHERE \`merchant_offer_fetch_last_summary\` IS NOT NULL
      AND LENGTH(TRIM(COALESCE(\`merchant_offer_fetch_last_summary\`, ''))) > 0
      AND SUBSTR(TRIM(\`merchant_offer_fetch_last_summary\`), 1, 1) NOT IN ('{', '[')
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
