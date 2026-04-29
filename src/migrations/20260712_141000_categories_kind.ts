import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

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

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'categories', [
    { name: 'kind', ddl: "text DEFAULT 'article'" },
  ])
  try {
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`categories_kind_idx\` ON \`categories\` (\`kind\`);`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate') && !msg.includes('already exists')) throw e
  }
}

/** SQLite lacks DROP COLUMN; leave `kind` in place on rollback. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
