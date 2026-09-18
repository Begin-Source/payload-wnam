/** Durable, central-only journal for pinned site data deliveries. Capability
 * material is never stored; only its SHA-256 digest is retained. */
export const dataDeliverySchema = [
  `CREATE TABLE IF NOT EXISTS site_data_deliveries (
    operation_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES site_runtime_registry(site_id) ON DELETE RESTRICT,
    actor_user_id TEXT NOT NULL,
    worker_group TEXT NOT NULL,
    routing_version INTEGER NOT NULL CHECK(routing_version>0),
    kind TEXT NOT NULL CHECK(kind IN ('master','config','asset')),
    reference_json TEXT NOT NULL CHECK(json_valid(reference_json)),
    reference_digest TEXT NOT NULL CHECK(length(reference_digest)=64),
    capability_hash TEXT NOT NULL UNIQUE CHECK(length(capability_hash)=64),
    state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','retry','succeeded','dead','cancelled')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0 AND attempt_count<=5),
    lease_owner TEXT,
    lease_expires_at INTEGER,
    next_attempt_at INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    last_error_code TEXT,
    receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json))
  )`,
  `CREATE INDEX IF NOT EXISTS site_data_delivery_ready
    ON site_data_deliveries(state,next_attempt_at,created_at,operation_id)`,
  `CREATE INDEX IF NOT EXISTS site_data_delivery_site_history
    ON site_data_deliveries(site_id,created_at DESC,operation_id DESC)`,
  `CREATE TRIGGER IF NOT EXISTS site_data_delivery_immutable BEFORE UPDATE ON site_data_deliveries
    WHEN NEW.operation_id IS NOT OLD.operation_id OR NEW.site_id IS NOT OLD.site_id
      OR NEW.actor_user_id IS NOT OLD.actor_user_id OR NEW.worker_group IS NOT OLD.worker_group
      OR NEW.routing_version IS NOT OLD.routing_version OR NEW.kind IS NOT OLD.kind
      OR NEW.reference_json IS NOT OLD.reference_json OR NEW.reference_digest IS NOT OLD.reference_digest
      OR NEW.capability_hash IS NOT OLD.capability_hash OR NEW.created_at IS NOT OLD.created_at
      OR NEW.attempt_count<OLD.attempt_count
      OR (OLD.state IN ('succeeded','dead','cancelled') AND NEW.state IS NOT OLD.state)
    BEGIN SELECT RAISE(ABORT,'Site data delivery identity or terminal state is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_data_delivery_no_delete BEFORE DELETE ON site_data_deliveries
    BEGIN SELECT RAISE(ABORT,'Site data delivery history is immutable'); END`,
] as const

export const dataDeliverySchemaObjects = [
  'site_data_deliveries','site_data_delivery_ready','site_data_delivery_site_history',
  'site_data_delivery_immutable','site_data_delivery_no_delete',
] as const

export async function migrateDataDeliveries(database: D1Database): Promise<void> {
  await database.batch(dataDeliverySchema.map(sql => database.prepare(sql)))
}
