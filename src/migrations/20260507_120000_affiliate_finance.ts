import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Affiliate finance: per-user tracking & cuts, AI cost on articles/media,
 * `affiliate-earnings-imports` / `affiliate-earnings-rows`, `commission-statements`,
 * plus MCP + locked-document rel columns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const usersCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('users')`)
  const usersNames = new Set(usersCols.map((c) => c.name))
  const addUserCol = async (name: string, stmt: ReturnType<typeof sql>) => {
    if (usersNames.has(name)) return
    try {
      await db.run(stmt)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
  await addUserCol(
    'amazon_tracking_id',
    sql`ALTER TABLE \`users\` ADD \`amazon_tracking_id\` text;`,
  )
  await addUserCol(
    'profit_share_pct',
    sql`ALTER TABLE \`users\` ADD \`profit_share_pct\` numeric;`,
  )
  await addUserCol(
    'leader_cut_pct_override',
    sql`ALTER TABLE \`users\` ADD \`leader_cut_pct_override\` numeric;`,
  )
  await addUserCol(
    'ops_cut_pct_override',
    sql`ALTER TABLE \`users\` ADD \`ops_cut_pct_override\` numeric;`,
  )
  await addUserCol(
    'ops_manager_id',
    sql`ALTER TABLE \`users\` ADD \`ops_manager_id\` integer REFERENCES users(id) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`users_amazon_tracking_id_idx\` ON \`users\` (\`amazon_tracking_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`users_ops_manager_idx\` ON \`users\` (\`ops_manager_id\`);`,
  )

  const sitesCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('sites')`)
  if (!sitesCols.some((c) => c.name === 'default_amazon_tracking_id')) {
    try {
      await db.run(sql`ALTER TABLE \`sites\` ADD \`default_amazon_tracking_id\` text;`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }

  const articleCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('articles')`)
  const articleNames = new Set(articleCols.map((c) => c.name))
  if (!articleNames.has('created_by_id')) {
    await db.run(
      sql`ALTER TABLE \`articles\` ADD \`created_by_id\` integer REFERENCES users(id) ON UPDATE no action ON DELETE set null;`,
    )
  }
  if (!articleNames.has('ai_cost_usd')) {
    await db.run(sql`ALTER TABLE \`articles\` ADD \`ai_cost_usd\` numeric DEFAULT 0;`)
  }
  if (!articleNames.has('ai_cost_breakdown')) {
    await db.run(sql`ALTER TABLE \`articles\` ADD \`ai_cost_breakdown\` text;`)
  }
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`articles_created_by_id_idx\` ON \`articles\` (\`created_by_id\`);`,
  )

  const mediaCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('media')`)
  const mediaNames = new Set(mediaCols.map((c) => c.name))
  if (!mediaNames.has('created_by_id')) {
    await db.run(
      sql`ALTER TABLE \`media\` ADD \`created_by_id\` integer REFERENCES users(id) ON UPDATE no action ON DELETE set null;`,
    )
  }
  if (!mediaNames.has('ai_cost_usd')) {
    await db.run(sql`ALTER TABLE \`media\` ADD \`ai_cost_usd\` numeric DEFAULT 0;`)
  }
  if (!mediaNames.has('ai_cost_breakdown')) {
    await db.run(sql`ALTER TABLE \`media\` ADD \`ai_cost_breakdown\` text;`)
  }
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`media_created_by_id_idx\` ON \`media\` (\`created_by_id\`);`,
  )

  const importsCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'affiliate_earnings_imports'`,
  )
  if (!importsCheck?.c) {
    await db.run(sql`CREATE TABLE \`affiliate_earnings_imports\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`source\` text DEFAULT 'amazon_associates',
  	\`period_start\` text,
  	\`period_end\` text,
  	\`file_name\` text,
  	\`rows_count\` integer DEFAULT 0,
  	\`gross_earnings_usd\` numeric DEFAULT 0,
  	\`imported_by_id\` integer,
  	\`notes\` text,
  	\`raw_summary_json\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`imported_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_imports_tenant_idx\` ON \`affiliate_earnings_imports\` (\`tenant_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_imports_updated_at_idx\` ON \`affiliate_earnings_imports\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_imports_created_at_idx\` ON \`affiliate_earnings_imports\` (\`created_at\`);`,
    )
  }

  const rowsCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'affiliate_earnings_rows'`,
  )
  if (!rowsCheck?.c) {
    await db.run(sql`CREATE TABLE \`affiliate_earnings_rows\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`batch_id\` integer NOT NULL,
  	\`tracking_id\` text NOT NULL,
  	\`recipient_id\` integer,
  	\`clicks\` integer DEFAULT 0,
  	\`items_ordered\` integer DEFAULT 0,
  	\`ordered_revenue_usd\` numeric,
  	\`items_shipped\` integer DEFAULT 0,
  	\`items_returned\` integer DEFAULT 0,
  	\`shipped_revenue_usd\` numeric,
  	\`returned_revenue_usd\` numeric,
  	\`total_earnings_usd\` numeric,
  	\`bonus_usd\` numeric,
  	\`shipped_earnings_usd\` numeric,
  	\`returned_earnings_usd\` numeric,
  	\`period_start\` text NOT NULL,
  	\`period_end\` text NOT NULL,
  	\`raw_json\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`batch_id\`) REFERENCES \`affiliate_earnings_imports\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`recipient_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_rows_tenant_idx\` ON \`affiliate_earnings_rows\` (\`tenant_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_rows_batch_idx\` ON \`affiliate_earnings_rows\` (\`batch_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_rows_tracking_id_idx\` ON \`affiliate_earnings_rows\` (\`tracking_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_rows_recipient_idx\` ON \`affiliate_earnings_rows\` (\`recipient_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_rows_updated_at_idx\` ON \`affiliate_earnings_rows\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`affiliate_earnings_rows_created_at_idx\` ON \`affiliate_earnings_rows\` (\`created_at\`);`,
    )
  }

  const stmtCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'commission_statements'`,
  )
  if (!stmtCheck?.c) {
    await db.run(sql`CREATE TABLE \`commission_statements\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`kind\` text NOT NULL,
  	\`recipient_id\` integer NOT NULL,
  	\`source_employee_id\` integer NOT NULL,
  	\`period_start\` text NOT NULL,
  	\`period_end\` text NOT NULL,
  	\`gross_earnings_usd\` numeric,
  	\`ai_costs_usd\` numeric,
  	\`adjustments_usd\` numeric DEFAULT 0,
  	\`net_profit_usd\` numeric,
  	\`pct_applied\` numeric,
  	\`payout_amount_usd\` numeric,
  	\`lines\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`paid_at\` text,
  	\`payment_ref\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`recipient_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`source_employee_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
    await db.run(
      sql`CREATE INDEX \`commission_statements_tenant_idx\` ON \`commission_statements\` (\`tenant_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`commission_statements_recipient_idx\` ON \`commission_statements\` (\`recipient_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`commission_statements_source_employee_idx\` ON \`commission_statements\` (\`source_employee_id\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`commission_statements_updated_at_idx\` ON \`commission_statements\` (\`updated_at\`);`,
    )
    await db.run(
      sql`CREATE INDEX \`commission_statements_created_at_idx\` ON \`commission_statements\` (\`created_at\`);`,
    )
  }

  await addLockedDocumentsRelsColumns(db)
  await addMcpApiKeyColumns(db)
}

async function addLockedDocumentsRelsColumns(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  const names = new Set(relCols.map((c) => c.name))
  if (!names.has('affiliate_earnings_imports_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`affiliate_earnings_imports_id\` integer REFERENCES affiliate_earnings_imports(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_affiliate_earnings_imports_id_idx\` ON \`payload_locked_documents_rels\` (\`affiliate_earnings_imports_id\`);`,
    )
  }
  if (!names.has('affiliate_earnings_rows_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`affiliate_earnings_rows_id\` integer REFERENCES affiliate_earnings_rows(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_affiliate_earnings_rows_id_idx\` ON \`payload_locked_documents_rels\` (\`affiliate_earnings_rows_id\`);`,
    )
  }
  if (!names.has('commission_statements_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commission_statements_id\` integer REFERENCES commission_statements(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_commission_statements_id_idx\` ON \`payload_locked_documents_rels\` (\`commission_statements_id\`);`,
    )
  }
}

async function addMcpApiKeyColumns(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_mcp_api_keys')`)
  const names = new Set(cols.map((c) => c.name))
  const add = async (name: string, stmt: ReturnType<typeof sql>) => {
    if (names.has(name)) return
    try {
      await db.run(stmt)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
  await add(
    'affiliate_earnings_imports_find',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_imports_find\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_imports_create',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_imports_create\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_imports_update',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_imports_update\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_imports_delete',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_imports_delete\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_rows_find',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_rows_find\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_rows_create',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_rows_create\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_rows_update',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_rows_update\` integer DEFAULT false;`,
  )
  await add(
    'affiliate_earnings_rows_delete',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`affiliate_earnings_rows_delete\` integer DEFAULT false;`,
  )
  await add(
    'commission_statements_find',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`commission_statements_find\` integer DEFAULT false;`,
  )
  await add(
    'commission_statements_create',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`commission_statements_create\` integer DEFAULT false;`,
  )
  await add(
    'commission_statements_update',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`commission_statements_update\` integer DEFAULT false;`,
  )
  await add(
    'commission_statements_delete',
    sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`commission_statements_delete\` integer DEFAULT false;`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260507_120000_affiliate_finance: down not supported.')
}
