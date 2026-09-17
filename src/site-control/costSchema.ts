/** Central-only explicit migration. No browser CRUD or request-time DDL. */
export const centralCostSchema = [
  `CREATE TABLE IF NOT EXISTS central_cost_epoch (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL)`,
  `INSERT INTO central_cost_epoch VALUES (1,0) ON CONFLICT(id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS central_cost_events (
    site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id), collection TEXT NOT NULL,
    record_id TEXT NOT NULL, cost_kind TEXT NOT NULL CHECK(cost_kind IN ('ai','dfs')), revision INTEGER NOT NULL CHECK(revision > 0),
    employee_id INTEGER NOT NULL REFERENCES users(id), tenant_id INTEGER NOT NULL REFERENCES tenants(id), record_created_at TEXT NOT NULL,
    amount_microusd INTEGER NOT NULL CHECK(amount_microusd >= 0),
    state TEXT NOT NULL CHECK(state IN ('pending','confirmed')), digest TEXT NOT NULL,
    PRIMARY KEY(site_id,collection,record_id,cost_kind,revision)
  )`,
  `CREATE TABLE IF NOT EXISTS central_cost_records (
    site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id), collection TEXT NOT NULL,
    record_id TEXT NOT NULL, cost_kind TEXT NOT NULL CHECK(cost_kind IN ('ai','dfs')), revision INTEGER NOT NULL CHECK(revision > 0),
    employee_id INTEGER NOT NULL REFERENCES users(id), tenant_id INTEGER NOT NULL REFERENCES tenants(id), record_created_at TEXT NOT NULL,
    amount_microusd INTEGER NOT NULL CHECK(amount_microusd >= 0),
    state TEXT NOT NULL CHECK(state IN ('pending','confirmed')), digest TEXT NOT NULL,
    PRIMARY KEY(site_id,collection,record_id,cost_kind)
  )`,
  `CREATE INDEX IF NOT EXISTS central_cost_employee_period ON central_cost_records(employee_id,tenant_id,record_created_at)`,
  `CREATE TABLE IF NOT EXISTS central_cost_reconciliations (
    id TEXT PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES users(id), tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    period_start TEXT NOT NULL, period_end_exclusive TEXT NOT NULL,
    amount_microusd INTEGER NOT NULL CHECK(amount_microusd >= 0),
    ai_microusd INTEGER NOT NULL CHECK(ai_microusd >= 0), dfs_microusd INTEGER NOT NULL CHECK(dfs_microusd >= 0),
    sources_json TEXT NOT NULL, checked_at TEXT NOT NULL, valid INTEGER NOT NULL CHECK(valid IN (0,1))
  )`,
  `CREATE INDEX IF NOT EXISTS central_cost_reconciliation_lookup ON central_cost_reconciliations(employee_id,tenant_id,period_start,period_end_exclusive,valid)`,
  ...(['INSERT','UPDATE','DELETE'] as const).map(operation => {
    const rows = operation === 'UPDATE' ? ['OLD','NEW'] : [operation === 'INSERT' ? 'NEW' : 'OLD']
    const scope = rows.map(row => `(employee_id = ${row}.employee_id AND tenant_id = ${row}.tenant_id AND period_start <= ${row}.record_created_at
      AND period_end_exclusive > ${row}.record_created_at)`).join(' OR ')
    return `CREATE TRIGGER IF NOT EXISTS central_cost_${operation.toLowerCase()} AFTER ${operation} ON central_cost_records BEGIN
      UPDATE central_cost_epoch SET revision = revision + 1 WHERE id = 1;
      UPDATE central_cost_reconciliations SET valid = 0 WHERE valid = 1 AND (${scope});
    END`
  }),
] as const

export async function migrateCentralCosts(database: D1Database): Promise<void> {
  await database.batch(centralCostSchema.map(sql => database.prepare(sql)))
}
