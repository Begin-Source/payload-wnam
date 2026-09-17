import { mkdirSync, writeFileSync } from 'node:fs'

/** Export only the disposable full-schema test database, for the subsequent
 * complete Worker/browser checks in the same Cloudflare job. Never remote D1. */
export async function writeRoleFixture(database: D1Database,role: 'central'): Promise<void> {
  if (process.env.WORKERS_CI !== '1') return
  const { results } = await database.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid")
    .all<{ name: string;type: string;sql: string }>()
  const tables = []
  for (const item of results.filter(item => item.type === 'table')) {
    const quoted = '"' + item.name.replaceAll('"','""') + '"'
    const rows = await database.prepare(`SELECT * FROM ${quoted}`).all()
    tables.push({ name: item.name,rows: rows.results })
  }
  mkdirSync('.cloudflare-ci',{ recursive: true })
  writeFileSync(`.cloudflare-ci/role-${role}-fixture.json`,JSON.stringify({ schema: results.map(item => item.sql),tables }))
}
