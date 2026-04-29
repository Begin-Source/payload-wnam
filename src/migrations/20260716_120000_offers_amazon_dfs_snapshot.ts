import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

async function ensureColumn(
  db: MigrateUpArgs['db'],
  table: 'offers',
  column: string,
  ddlSuffix: string,
): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('offers')`)
  if (cols.some((c) => c.name === column)) return
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${column}\` ${ddlSuffix};`))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
  }
}

/** Near-full DataForSEO Merchant raw item snapshot (`amazon.dfsSnapshot` JSON column). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await ensureColumn(db, 'offers', 'amazon_dfs_snapshot', 'text')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
