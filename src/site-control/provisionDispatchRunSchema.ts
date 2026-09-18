/** Authoritative build execution state introduced after the original dispatch
 * outbox. A failed attempt can be cleared only after its full identity and
 * reviewed failure evidence are archived; success still requires both the
 * six-step provision receipt and the Cloudflare build success event. */
export const provisionDispatchRunV7ImmutableSQL = `CREATE TRIGGER site_provision_dispatch_run_immutable BEFORE UPDATE ON site_provision_dispatch_runs
    WHEN NEW.request_id IS NOT OLD.request_id OR NEW.input_digest IS NOT OLD.input_digest
      OR NEW.build_branch IS NOT OLD.build_branch OR NEW.queued_at IS NOT OLD.queued_at
      OR NEW.attempt_count<OLD.attempt_count
      OR (OLD.build_uuid IS NOT NULL AND NEW.build_uuid IS NOT OLD.build_uuid)
      OR (OLD.state IN ('succeeded','cancelled') AND NEW.state IS NOT OLD.state)
    BEGIN SELECT RAISE(ABORT,'Provision dispatch run identity or terminal state is immutable'); END`

export const provisionDispatchRunImmutableSQL = `CREATE TRIGGER IF NOT EXISTS site_provision_dispatch_run_immutable BEFORE UPDATE ON site_provision_dispatch_runs
    WHEN NEW.request_id IS NOT OLD.request_id OR NEW.input_digest IS NOT OLD.input_digest
      OR NEW.build_branch IS NOT OLD.build_branch OR NEW.queued_at IS NOT OLD.queued_at
      OR NEW.attempt_count<OLD.attempt_count
      OR (OLD.state IN ('succeeded','cancelled') AND NEW.state IS NOT OLD.state)
      OR ((OLD.build_uuid IS NOT NULL AND NEW.build_uuid IS NOT OLD.build_uuid)
        OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS NOT OLD.attempt_id)
        OR (OLD.build_commit IS NOT NULL AND NEW.build_commit IS NOT OLD.build_commit)
        OR (OLD.build_outcome IS NOT NULL AND NEW.build_outcome IS NOT OLD.build_outcome))
        AND NOT (NEW.state='queued' AND NEW.attempt_id IS NULL AND NEW.build_uuid IS NULL
          AND NEW.build_commit IS NULL AND NEW.build_outcome IS NULL AND NEW.trigger_started_at IS NULL
          AND NEW.dispatched_at IS NULL AND NEW.running_at IS NULL AND NEW.completed_at IS NULL
          AND EXISTS (SELECT 1 FROM site_provision_dispatch_attempts a
            WHERE a.request_id=OLD.request_id AND a.attempt_count=OLD.attempt_count
              AND a.attempt_id IS OLD.attempt_id AND a.build_uuid IS OLD.build_uuid
              AND a.build_commit IS OLD.build_commit AND a.build_outcome IS OLD.build_outcome
              AND a.dispatch_state=OLD.state))
    BEGIN SELECT RAISE(ABORT,'Provision dispatch run identity or terminal state is immutable'); END`

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
  `CREATE TABLE IF NOT EXISTS site_provision_dispatch_attempts (
    request_id TEXT NOT NULL REFERENCES site_provision_requests(request_id) ON DELETE RESTRICT,
    attempt_count INTEGER NOT NULL CHECK(attempt_count>0),
    attempt_id TEXT NOT NULL,
    build_uuid TEXT NOT NULL UNIQUE,
    build_commit TEXT,
    build_outcome TEXT,
    dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('dispatched','running','needs_review')),
    trigger_started_at TEXT NOT NULL,
    dispatched_at TEXT,
    running_at TEXT,
    completed_at TEXT,
    recovery_id TEXT NOT NULL UNIQUE,
    recovery_reason TEXT NOT NULL,
    recovery_evidence_status TEXT NOT NULL CHECK(recovery_evidence_status='stopped'),
    recovery_evidence_outcome TEXT NOT NULL CHECK(recovery_evidence_outcome='fail'),
    recovery_trigger_source TEXT NOT NULL CHECK(recovery_trigger_source='deploy_hook'),
    reviewed_at TEXT NOT NULL,
    PRIMARY KEY(request_id,attempt_count)
  )`,
  provisionDispatchRunImmutableSQL,
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
  'site_provision_dispatch_runs','site_provision_dispatch_run_one_active','site_provision_dispatch_run_queue','site_provision_dispatch_attempts',
  'site_provision_dispatch_run_immutable','site_provision_dispatch_run_requested',
  'site_provision_dispatch_run_cancelled','site_provision_dispatch_run_reserved',
  'site_provision_dispatch_run_completed',
] as const

export const provisionDispatchRunV7SchemaObjects = provisionDispatchRunSchemaObjects
  .filter(name => name !== 'site_provision_dispatch_attempts')
