import { siteLifecycleSchema } from './lifecycleSchema'
import { siteProvisionSchema } from './provisionSchema'
import { groupReleaseSchema } from './groupReleaseSchema'

/** Explicit central provisioning migration; never run from a request/onInit hook. */
export const siteControlSchema = [
  `CREATE TABLE IF NOT EXISTS site_runtime_registry (
    site_id TEXT PRIMARY KEY, local_site_id INTEGER NOT NULL CHECK(local_site_id > 0),
    database_id TEXT NOT NULL UNIQUE,
    binding_name TEXT NOT NULL, worker_group TEXT NOT NULL,
    admin_host TEXT NOT NULL UNIQUE, schema_version INTEGER NOT NULL CHECK(schema_version > 0),
    routing_version INTEGER NOT NULL CHECK(routing_version > 0),
    migration_state TEXT NOT NULL CHECK(migration_state IN ('provisioning','active','paused','migrating','retired')),
    timezone TEXT NOT NULL, production_enabled INTEGER NOT NULL CHECK(production_enabled IN (0,1)),
    operation_id TEXT NOT NULL UNIQUE, UNIQUE(worker_group, binding_name)
  )`,
  `CREATE TABLE IF NOT EXISTS site_runtime_access (
    site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('viewer','editor','publisher','manager')),
    PRIMARY KEY(site_id,user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS site_runtime_access_user_site ON site_runtime_access(user_id,site_id)`,
  `CREATE TABLE IF NOT EXISTS site_login_tickets (
    token_hash TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, central_session_id TEXT NOT NULL, admin_host TEXT NOT NULL,
    routing_version INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS site_login_tickets_expiry ON site_login_tickets(expires_at)`,
  `CREATE TABLE IF NOT EXISTS site_login_sessions (
    token_hash TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, central_session_id TEXT NOT NULL, admin_host TEXT NOT NULL,
    routing_version INTEGER NOT NULL, expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS site_login_sessions_expiry ON site_login_sessions(expires_at)`,
  ...siteLifecycleSchema,
  ...siteProvisionSchema,
  ...groupReleaseSchema,
] as const

export async function migrateSiteControl(database: D1Database): Promise<void> {
  await database.batch(siteControlSchema.map(sql => database.prepare(sql)))
}
