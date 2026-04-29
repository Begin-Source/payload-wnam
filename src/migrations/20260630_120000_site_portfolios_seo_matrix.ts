import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Site portfolios (SEO matrix grouping) + optional `sites.portfolio_id`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'site_portfolios'`,
  )
  if (!tableCheck?.c) {
    await db.run(sql`CREATE TABLE \`site_portfolios\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
    await db.run(sql`CREATE INDEX \`site_portfolios_tenant_idx\` ON \`site_portfolios\` (\`tenant_id\`);`)
    await db.run(sql`CREATE INDEX \`site_portfolios_slug_idx\` ON \`site_portfolios\` (\`slug\`);`)
    await db.run(sql`CREATE INDEX \`site_portfolios_updated_at_idx\` ON \`site_portfolios\` (\`updated_at\`);`)
    await db.run(sql`CREATE INDEX \`site_portfolios_created_at_idx\` ON \`site_portfolios\` (\`created_at\`);`)
  }

  const siteCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!siteCols.some((c) => c.name === 'portfolio_id')) {
    await db.run(
      sql`ALTER TABLE \`sites\` ADD \`portfolio_id\` integer REFERENCES site_portfolios(id);`,
    )
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`sites_portfolio_idx\` ON \`sites\` (\`portfolio_id\`);`)
  }

  await addLockedDocumentsRelsColumn(db)
  await addMcpApiKeyColumns(db)

  const wjCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('workflow_jobs')`)
  if (!wjCols.some((c) => c.name === 'matrix_template')) {
    try {
      await db.run(sql`ALTER TABLE \`workflow_jobs\` ADD \`matrix_template\` text DEFAULT '';`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

async function addMcpApiKeyColumns(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_mcp_api_keys')`)
  const names = new Set(cols.map((c) => c.name))
  const add = async (name: string, sqlStmt: ReturnType<typeof sql>) => {
    if (names.has(name)) return
    try {
      await db.run(sqlStmt)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
  await add(
    'site_portfolios_find',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`site_portfolios_find\` integer DEFAULT false;`,
  )
  await add(
    'site_portfolios_create',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`site_portfolios_create\` integer DEFAULT false;`,
  )
  await add(
    'site_portfolios_update',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`site_portfolios_update\` integer DEFAULT false;`,
  )
  await add(
    'site_portfolios_delete',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`site_portfolios_delete\` integer DEFAULT false;`,
  )
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'site_portfolios_id')) {
    return
  }
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`site_portfolios_id\` integer REFERENCES site_portfolios(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_site_portfolios_id_idx\` ON \`payload_locked_documents_rels\` (\`site_portfolios_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260630_120000_site_portfolios_seo_matrix is irreversible without data loss. Restore from backup.',
  )
}
