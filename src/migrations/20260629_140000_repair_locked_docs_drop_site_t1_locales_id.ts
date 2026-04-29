import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

const TABLE_SQL_NAME = 'payload_locked_documents_rels'
const REBUILD = 'payload_locked_documents_rels__rebuild_20260629'
const ORPHAN = 'site_t1_locales_id'

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

type IndexRow = { name: string; sql: string | null }

function quoteId(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``
}

/** Match style in e.g. 20260420_093625. */
function refAction(pragma: string | undefined | null): string {
  if (!pragma || pragma.trim() === '') return 'no action'
  return pragma.trim().toLowerCase().replace(/_/g, ' ')
}

/**
 * 20260624 已 DROP `site_t1_locales`；若 D1/旧 sqlite 的 `ALTER TABLE ... DROP COLUMN` 失败，
 * 会残留 `site_t1_locales_id` + REFERENCES 悬空表，导致 `no such table: main.site_t1_locales`。
 * 用 12-step 重建表以删除孤儿列；无该列则幂等跳过。
 * 外键只保留“引用表仍存在”的约束（`20260624` 会 DROP `landing_templates` 等，否则 INSERT 时校验会报无表）。
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tables = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
  )
  const tableNames = new Set(tables.map((t) => t.name.toLowerCase()))

  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  const hasOrphan = cols.some((c) => c.name === ORPHAN)
  if (!hasOrphan) return

  const keep = cols.filter((c) => c.name !== ORPHAN).sort((a, b) => a.cid - b.cid)
  if (keep.length === 0) {
    throw new Error(
      '20260629_140000_repair_locked_docs_drop_site_t1_locales_id: no columns left after drop',
    )
  }

  const fkAll = await db.all<FkListRow>(sql`PRAGMA foreign_key_list('payload_locked_documents_rels')`)
  const fks = fkAll.filter(
    (r) =>
      r.table.toLowerCase() !== 'site_t1_locales' &&
      r.from.toLowerCase() !== ORPHAN &&
      tableNames.has(r.table.toLowerCase()),
  )

  const byFkId = new Map<number, FkListRow[]>()
  for (const r of fks) {
    const arr = byFkId.get(r.id) ?? []
    arr.push(r)
    byFkId.set(r.id, arr)
  }
  const fkGroups = [...byFkId.values()].map((g) => g.sort((a, b) => a.seq - b.seq))

  const indexes = await db.all<IndexRow>(
    sql`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'payload_locked_documents_rels' AND sql IS NOT NULL`,
  )
  const indexSqls = indexes.filter(
    (i) => i.name && !i.name.toLowerCase().startsWith('sqlite_autoindex_'),
  )

  const pkCols = keep.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk)
  const singlePk = pkCols.length === 1
  const compositePk = pkCols.length > 1

  const colLines: string[] = []
  for (const c of keep) {
    const parts: string[] = [quoteId(c.name)]
    const t = c.type && c.type.trim() !== '' ? c.type : 'NUMERIC'
    parts.push(t)
    if (c.notnull) parts.push('NOT NULL')
    if (c.dflt_value != null) parts.push('DEFAULT ' + c.dflt_value)
    if (singlePk && c.pk > 0) {
      parts.push('PRIMARY KEY')
    }
    colLines.push('\t' + parts.join(' '))
  }
  if (compositePk) {
    colLines.push(
      '\t' + `PRIMARY KEY (${pkCols.map((c) => quoteId(c.name)).join(', ')})`,
    )
  }
  for (const g of fkGroups) {
    const a = g[0]
    const onUp = refAction(a.on_update)
    const onDel = refAction(a.on_delete)
    const fromList = g.map((r) => quoteId(r.from)).join(', ')
    const toList = g.map((r) => quoteId(r.to)).join(', ')
    const cTable = quoteId(a.table)
    colLines.push(
      '\t' +
        `FOREIGN KEY (${fromList}) REFERENCES ${cTable}(${toList}) ON UPDATE ${onUp} ON DELETE ${onDel}`,
    )
  }

  const createSql = `CREATE TABLE \`${REBUILD}\` (
${colLines.join(',\n')}
);`

  await db.run(sql.raw(`DROP TABLE IF EXISTS \`${REBUILD}\``))
  await db.run(sql.raw(createSql))

  const colNamesQ = keep.map((c) => quoteId(c.name)).join(', ')
  await db.run(sql`PRAGMA foreign_keys = OFF`)
  try {
    await db.run(
      sql.raw(
        `INSERT INTO \`${REBUILD}\` (${colNamesQ}) SELECT ${colNamesQ} FROM \`${TABLE_SQL_NAME}\``,
      ),
    )
  } finally {
    await db.run(sql`PRAGMA foreign_keys = ON`)
  }
  await db.run(sql.raw(`DROP TABLE \`${TABLE_SQL_NAME}\``))
  await db.run(
    sql.raw(`ALTER TABLE \`${REBUILD}\` RENAME TO \`${TABLE_SQL_NAME}\``),
  )

  for (const i of indexSqls) {
    if (!i.sql) continue
    if (i.name === 'payload_locked_documents_rels_site_t1_locales_id_idx') continue
    if (i.sql.toLowerCase().includes('site_t1_locales')) continue
    try {
      await db.run(sql.raw(i.sql))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('already exists') || msg.includes('duplicate')) continue
      throw e
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
