import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `publicLocaleCodes` (`select` + `hasMany`) is stored in `sites_public_locale_codes`, not in
 * `sites.public_locale_codes` (legacy wrong column from 20260803). Create the child table and
 * backfill from JSON when present, else zh + en.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`sites_public_locale_codes\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`sites_public_locale_codes_order_idx\` ON \`sites_public_locale_codes\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`sites_public_locale_codes_parent_idx\` ON \`sites_public_locale_codes\` (\`parent_id\`);`,
  )

  const siteCols = await db.all<{ name: string }>(sql`PRAGMA table_info('sites')`)
  const hasLegacyJsonCol = siteCols.some((c) => c.name === 'public_locale_codes')
  if (hasLegacyJsonCol) {
    await db.run(
      sql.raw(`INSERT INTO \`sites_public_locale_codes\` (\`order\`, \`parent_id\`, \`value\`)
      SELECT CAST(j.key AS INTEGER), s.id, j.value
      FROM sites s, json_each(s.public_locale_codes) AS j
      WHERE json_valid(s.public_locale_codes)
        AND json_type(s.public_locale_codes) = 'array'
        AND json_array_length(s.public_locale_codes) > 0`),
    )
  }

  await db.run(
    sql.raw(`INSERT INTO \`sites_public_locale_codes\` (\`order\`, \`parent_id\`, \`value\`)
    SELECT o.ord, s.id, o.code
    FROM sites s
    CROSS JOIN (
      SELECT 0 AS ord, 'zh' AS code
      UNION ALL
      SELECT 1 AS ord, 'en' AS code
    ) AS o
    WHERE NOT EXISTS (
      SELECT 1 FROM \`sites_public_locale_codes\` c WHERE c.\`parent_id\` = s.id
    )`),
  )

  await runIgnoreNoSuch(db, () =>
    db.run(sql.raw('ALTER TABLE `sites` DROP COLUMN `public_locale_codes`')),
  )
}

async function runIgnoreNoSuch(
  db: MigrateUpArgs['db'],
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('no such column') || msg.includes('no such table')) return
    throw e
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`sites_public_locale_codes\`;`)
}
