/** Authoritative build execution state introduced after the original dispatch
 * outbox. The v6 row remains immutable history; a run becomes successful only
 * after both the six-step provision receipt and the Cloudflare build success
 * event exist. */
export const provisionDispatchRunSchema = [
  `CREATE TABLE IF NOT EXISTS site_provision_dispatch_runs (
    request_id TEXT PRIMARY KEY REFERENCES site_provision_requests(request_id) ON DELETE RESTRICT,
    input_digest TEXT NOT NULL,
    build_branch TEXT NOT NULL,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS site_provision_dispatch_run_one_active
    ON site_provision_dispatch_runs(active_slot)
    WHERE state IN ('triggering_unknown','dispatched','running','needs_review')`,
  `CREATE INDEX IF NOT EXISTS site_provision_dispatch_run_queue
    ON site_provision_dispatch_runs(state,queued_at,request_id)`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_run_immutable BEFORE UPDATE ON site_provision_dispatch_runs
    WHEN NEW.request_id IS NOT OLD.request_id OR NEW.input_digest IS NOT OLD.input_digest
      OR NEW.build_branch IS NOT OLD.build_branch OR NEW.queued_at IS NOT OLD.queued_at
      OR NEW.attempt_count<OLD.attempt_count
      OR (OLD.build_uuid IS NOT NULL AND NEW.build_uuid IS NOT OLD.build_uuid)
      OR (OLD.state IN ('succeeded','cancelled') AND NEW.state IS NOT OLD.state)
    BEGIN SELECT RAISE(ABORT,'Provision dispatch run identity or terminal state is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_run_requested AFTER INSERT ON site_provision_dispatches
    BEGIN INSERT INTO site_provision_dispatch_runs (request_id,input_digest,build_branch,queued_at)
      VALUES (NEW.request_id,NEW.input_digest,'feat/site-per-d1',NEW.queued_at); END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_run_cancelled AFTER UPDATE OF state ON site_provision_requests
    WHEN NEW.state='cancelled'
    BEGIN UPDATE site_provision_dispatch_runs SET state='cancelled',completed_at=NEW.cancelled_at,last_error_code=NULL
      WHERE request_id=NEW.request_id AND state='queued'; END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_run_reserved AFTER INSERT ON site_provision_operations
    BEGIN UPDATE site_provision_dispatch_runs SET state='running',running_at=COALESCE(running_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_error_code=NULL WHERE request_id=NEW.operation_id AND state IN ('triggering_unknown','dispatched'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_run_completed AFTER UPDATE OF completed_at ON site_provision_operations
    WHEN OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
    BEGIN UPDATE site_provision_dispatch_runs SET state='succeeded',completed_at=NEW.completed_at,last_error_code=NULL
      WHERE request_id=NEW.operation_id AND state='needs_review' AND build_outcome='success'; END`,
] as const

export const provisionDispatchRunSchemaObjects = [
  'site_provision_dispatch_runs','site_provision_dispatch_run_one_active','site_provision_dispatch_run_queue',
  'site_provision_dispatch_run_immutable','site_provision_dispatch_run_requested',
  'site_provision_dispatch_run_cancelled','site_provision_dispatch_run_reserved',
  'site_provision_dispatch_run_completed',
] as const
