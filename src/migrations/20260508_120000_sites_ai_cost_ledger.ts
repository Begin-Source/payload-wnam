import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/** Sites.aiCostUsd / aiCostBreakdown for pipeline AI spend attributed to site (domain gen, trust bundle, etc.). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('ai_cost_usd')) {
    try {
      await db.run(sql`ALTER TABLE \`sites\` ADD \`ai_cost_usd\` numeric DEFAULT 0;`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
  if (!names.has('ai_cost_breakdown')) {
    try {
      await db.run(sql`ALTER TABLE \`sites\` ADD \`ai_cost_breakdown\` text;`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260508_120000_sites_ai_cost_ledger: down not supported.')
}
