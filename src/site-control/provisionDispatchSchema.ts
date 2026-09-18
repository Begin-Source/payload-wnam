/** Durable bridge between a central admission and one Cloudflare Build. The
 * deploy-hook credential is deliberately absent: it remains a Worker secret. */
export const provisionDispatchSchema = [
  `CREATE TABLE IF NOT EXISTS site_provision_dispatches (
    request_id TEXT PRIMARY KEY REFERENCES site_provision_requests(request_id) ON DELETE RESTRICT,
    input_digest TEXT NOT NULL,
    branch TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued'
      CHECK(state IN ('queued','triggering_unknown','dispatched','running','succeeded','needs_review','cancelled')),
    active_slot INTEGER NOT NULL DEFAULT 1 CHECK(active_slot=1),
    attempt_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
    build_uuid TEXT UNIQUE,
    build_commit TEXT,
    build_outcome TEXT CHECK(build_outcome IS NULL OR build_outcome IN ('success','failure','canceled')),
    queued_at TEXT NOT NULL,
    trigger_started_at TEXT,
    dispatched_at TEXT,
    running_at TEXT,
    completed_at TEXT,
    last_error_code TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS site_provision_dispatch_one_active
    ON site_provision_dispatches(active_slot)
    WHERE state IN ('triggering_unknown','dispatched','running','needs_review')`,
  `CREATE INDEX IF NOT EXISTS site_provision_dispatch_queue
    ON site_provision_dispatches(state,queued_at,request_id)`,
  `CREATE TABLE IF NOT EXISTS site_provision_build_events (
    event_key TEXT PRIMARY KEY,
    build_uuid TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('started','failed','canceled','succeeded')),
    event_timestamp TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    received_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS site_provision_build_event_build
    ON site_provision_build_events(build_uuid,event_timestamp,event_type)`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_immutable BEFORE UPDATE ON site_provision_dispatches
    WHEN NEW.request_id IS NOT OLD.request_id OR NEW.input_digest IS NOT OLD.input_digest
      OR NEW.branch IS NOT OLD.branch OR NEW.queued_at IS NOT OLD.queued_at
      OR NEW.attempt_count<OLD.attempt_count
      OR (OLD.build_uuid IS NOT NULL AND NEW.build_uuid IS NOT OLD.build_uuid)
      OR (OLD.state IN ('succeeded','cancelled') AND NEW.state IS NOT OLD.state)
    BEGIN SELECT RAISE(ABORT,'Provision dispatch identity or terminal state is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_requested AFTER INSERT ON site_provision_requests
    BEGIN INSERT INTO site_provision_dispatches (request_id,input_digest,branch,queued_at)
      VALUES (NEW.request_id,NEW.input_digest,'ops/site-provision',NEW.created_at); END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_cancelled AFTER UPDATE OF state ON site_provision_requests
    WHEN NEW.state='cancelled'
    BEGIN UPDATE site_provision_dispatches SET state='cancelled',completed_at=NEW.cancelled_at,last_error_code=NULL
      WHERE request_id=NEW.request_id AND state='queued'; END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_reserved AFTER INSERT ON site_provision_operations
    BEGIN UPDATE site_provision_dispatches SET state='running',running_at=COALESCE(running_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_error_code=NULL WHERE request_id=NEW.operation_id AND state IN ('triggering_unknown','dispatched','needs_review'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_completed AFTER UPDATE OF completed_at ON site_provision_operations
    WHEN OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
    BEGIN UPDATE site_provision_dispatches SET state='succeeded',completed_at=NEW.completed_at,build_outcome='success',last_error_code=NULL
      WHERE request_id=NEW.operation_id AND state IN ('triggering_unknown','dispatched','running','needs_review'); END`,
] as const

export const provisionDispatchSchemaObjects = [
  'site_provision_dispatches','site_provision_dispatch_one_active','site_provision_dispatch_queue',
  'site_provision_build_events','site_provision_build_event_build','site_provision_dispatch_immutable',
  'site_provision_dispatch_requested','site_provision_dispatch_cancelled',
  'site_provision_dispatch_reserved','site_provision_dispatch_completed',
] as const
