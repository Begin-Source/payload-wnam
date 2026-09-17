/** Restricted maintenance journal. No account credentials or request bodies are
 * stored here. These objects are installed by an explicit central migration. */
export const siteProvisionSchema = [
  `CREATE TABLE IF NOT EXISTS site_provision_operations (
    operation_id TEXT PRIMARY KEY, site_id TEXT NOT NULL UNIQUE,
    local_site_id INTEGER NOT NULL UNIQUE CHECK(local_site_id > 0),
    worker_group TEXT NOT NULL, binding_name TEXT NOT NULL,
    database_name TEXT NOT NULL UNIQUE, database_id TEXT UNIQUE,
    plan_json TEXT NOT NULL, plan_digest TEXT NOT NULL,
    checkpoint INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint BETWEEN 0 AND 6),
    lease_owner TEXT, lease_epoch INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, completed_at TEXT,
    UNIQUE(worker_group,binding_name)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS site_provision_group_pending
    ON site_provision_operations(worker_group) WHERE completed_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS site_provision_active_leases
    ON site_provision_operations(lease_until) WHERE completed_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS site_provision_steps (
    operation_id TEXT NOT NULL REFERENCES site_provision_operations(operation_id),
    step INTEGER NOT NULL CHECK(step BETWEEN 1 AND 6),
    intent_digest TEXT NOT NULL, started_at TEXT NOT NULL,
    receipt_json TEXT, completed_at TEXT,
    PRIMARY KEY(operation_id,step)
  )`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_checkpoint AFTER UPDATE OF receipt_json ON site_provision_steps
    WHEN OLD.receipt_json IS NULL AND NEW.receipt_json IS NOT NULL
    BEGIN
      UPDATE site_provision_operations SET checkpoint = NEW.step,
        database_id = CASE WHEN NEW.step = 1 THEN json_extract(NEW.receipt_json,'$.databaseId') ELSE database_id END,
        completed_at = CASE WHEN NEW.step = 6 THEN NEW.completed_at ELSE NULL END,
        lease_owner = CASE WHEN NEW.step = 6 THEN NULL ELSE lease_owner END,
        lease_until = CASE WHEN NEW.step = 6 THEN 0 ELSE lease_until END
        WHERE operation_id = NEW.operation_id AND checkpoint = NEW.step - 1;
      SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT,'Provision checkpoint conflict') END;
    END`,
] as const

export const siteProvisionSchemaObjects = [
  'site_provision_operations','site_provision_group_pending','site_provision_active_leases',
  'site_provision_steps','site_provision_checkpoint',
] as const
