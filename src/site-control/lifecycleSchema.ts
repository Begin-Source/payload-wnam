/** Additive central migration. Operation receipts and the route change commit
 * in one SQLite statement; never initialize this schema from an HTTP request. */
export const siteLifecycleSchema = [
  `CREATE TABLE IF NOT EXISTS site_lifecycle_operations (
    operation_id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id),
    actor_user_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('pause','resume')),
    expected_version INTEGER NOT NULL CHECK(expected_version > 0),
    routing_version INTEGER NOT NULL CHECK(routing_version = expected_version + 1),
    applied_at TEXT NOT NULL,
    UNIQUE(site_id,routing_version)
  )`,
  `CREATE TRIGGER IF NOT EXISTS site_lifecycle_apply AFTER INSERT ON site_lifecycle_operations
    BEGIN
      UPDATE site_runtime_registry SET
        migration_state = CASE NEW.action WHEN 'pause' THEN 'paused' ELSE 'active' END,
        routing_version = NEW.routing_version
        WHERE site_id = NEW.site_id AND routing_version = NEW.expected_version
          AND migration_state = CASE NEW.action WHEN 'pause' THEN 'active' ELSE 'paused' END;
      SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT,'Site lifecycle routing conflict') END;
      DELETE FROM site_login_tickets WHERE site_id = NEW.site_id;
      DELETE FROM site_login_sessions WHERE site_id = NEW.site_id;
    END`,
  `CREATE TABLE IF NOT EXISTS site_control_schema_migrations (
    operation_id TEXT PRIMARY KEY, from_digest TEXT NOT NULL, to_digest TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`,
] as const

export const siteLifecycleSchemaObjects = [
  'site_lifecycle_operations', 'site_lifecycle_apply', 'site_control_schema_migrations',
] as const
