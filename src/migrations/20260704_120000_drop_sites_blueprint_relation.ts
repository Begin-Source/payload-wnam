import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

type FkListRow = {
  id: number
  seq: number
  table: string
  from: string
  to: string
  on_update: string
  on_delete: string
  match: string
}

function escapeIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

function buildColumnDefs(cols: TableInfoRow[]): string {
  const parts: string[] = []
  for (const c of cols) {
    if (c.name === 'blueprint_id') continue
    const name = escapeIdent(c.name)
    let piece = `${name} ${c.type}`
    if (c.pk === 1) {
      piece += ' PRIMARY KEY NOT NULL'
    } else {
      if (c.notnull === 1) piece += ' NOT NULL'
      if (c.dflt_value != null && c.dflt_value !== '') {
        const dv = c.dflt_value.trim()
        const isFuncDefault = /^\s*[a-z_]+\s*\(/i.test(dv) && !dv.startsWith('(')
        piece += isFuncDefault ? ` DEFAULT (${dv})` : ` DEFAULT ${dv}`
      }
    }
    parts.push(piece)
  }
  return parts.join(', ')
}

function buildForeignKeys(fks: FkListRow[]): string {
  const byId = new Map<number, FkListRow[]>()
  for (const row of fks) {
    if (row.from === 'blueprint_id') continue
    const list = byId.get(row.id) ?? []
    list.push(row)
    byId.set(row.id, list)
  }
  const clauses: string[] = []
  for (const [, rows] of byId) {
    rows.sort((a, b) => a.seq - b.seq)
    const fromCols = rows.map((r) => escapeIdent(r.from)).join(', ')
    const toCols = rows.map((r) => escapeIdent(r.to)).join(', ')
    const refTable = escapeIdent(rows[0].table)
    const onUp = rows[0].on_update === 'NO ACTION' ? 'no action' : rows[0].on_update.toLowerCase()
    const onDel = rows[0].on_delete === 'NO ACTION' ? 'no action' : rows[0].on_delete.toLowerCase()
    clauses.push(
      `FOREIGN KEY (${fromCols}) REFERENCES ${refTable}(${toCols}) ON UPDATE ${onUp} ON DELETE ${onDel}`,
    )
  }
  return clauses.length ? ', ' + clauses.join(', ') : ''
}

/**
 * Design → Site (`site_blueprints.site_id`) is the only authoritative link.
 * Remove `sites.blueprint_id`. D1/SQLite may reject `ALTER DROP COLUMN` on FK cols — rebuild `sites`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!cols.some((c) => c.name === 'blueprint_id')) return

  await db.run(
    sql.raw(`
      UPDATE site_blueprints
      SET site_id = (
        SELECT s.id FROM sites s WHERE s.blueprint_id = site_blueprints.id LIMIT 1
      )
      WHERE site_id IS NULL
        AND id IN (SELECT DISTINCT blueprint_id FROM sites WHERE blueprint_id IS NOT NULL)
    `),
  )

  const keepCols = cols.filter((c) => c.name !== 'blueprint_id')
  const colNamesSql = keepCols.map((c) => escapeIdent(c.name)).join(', ')
  const fks = await db.all<FkListRow>(sql`PRAGMA foreign_key_list('sites')`)

  const createBody = buildColumnDefs(cols) + buildForeignKeys(fks)
  const createSql = `CREATE TABLE \`__new_sites\` (${createBody})`

  const indexRows = await db.all<{ name: string; sql: string | null }>(
    sql`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sites' AND sql IS NOT NULL`,
  )

  await db.run(sql`PRAGMA foreign_keys = OFF`)

  await db.run(sql.raw(createSql))
  await db.run(
    sql.raw(`INSERT INTO \`__new_sites\` (${colNamesSql}) SELECT ${colNamesSql} FROM \`sites\``),
  )

  for (const idx of indexRows) {
    if (idx.name === 'sqlite_autoindex_sites_1') continue
    await db.run(sql.raw(`DROP INDEX IF EXISTS ${escapeIdent(idx.name)}`))
  }

  await db.run(sql`DROP TABLE \`sites\``)
  await db.run(sql`ALTER TABLE \`__new_sites\` RENAME TO \`sites\``)

  for (const idx of indexRows) {
    if (idx.name === 'sqlite_autoindex_sites_1') continue
    if (!idx.sql || idx.sql.toLowerCase().includes('blueprint_id')) continue
    await db.run(sql.raw(idx.sql))
  }

  await db.run(sql`PRAGMA foreign_keys = ON`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
