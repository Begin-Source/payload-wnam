/** SQL fragments take trusted column expressions only, never HTTP input. Resource
 * creation requires persisted admin/tenant-manager roles, not a client role or
 * an environment email shortcut. Both submission and maintenance recheck them. */
export const provisionActorPermission = (user: string,tenant: string) => `EXISTS (
  SELECT 1 FROM users u WHERE u.id=${user}
    AND (u.lock_until IS NULL OR julianday(u.lock_until)<=julianday('now'))
    AND (EXISTS (SELECT 1 FROM users_roles r WHERE r.parent_id=u.id AND r.value IN ('super-admin','system-admin'))
      OR (EXISTS (SELECT 1 FROM users_roles r WHERE r.parent_id=u.id AND r.value='general-manager')
        AND EXISTS (SELECT 1 FROM users_tenants t WHERE t._parent_id=u.id AND t.tenant_id=${tenant}))))`

export const provisionOwnerPermission = (user: string,tenant: string) => `EXISTS (
  SELECT 1 FROM users u WHERE u.id=${user}
    AND (u.lock_until IS NULL OR julianday(u.lock_until)<=julianday('now'))
    AND (EXISTS (SELECT 1 FROM users_roles r WHERE r.parent_id=u.id AND r.value IN ('super-admin','system-admin'))
      OR EXISTS (SELECT 1 FROM users_tenants t WHERE t._parent_id=u.id AND t.tenant_id=${tenant})))`

/** Install only with the reviewed central migration. No resource API token,
 * password, session secret or arbitrary command is stored in these objects. */
export const provisionAdmissionSchema = [
  `CREATE TABLE IF NOT EXISTS site_provision_requests (
    request_id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
    local_site_id INTEGER NOT NULL UNIQUE CHECK(local_site_id BETWEEN 1 AND 9007199254740991),
    actor_user_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL, owner_user_id INTEGER NOT NULL,
    input_json TEXT NOT NULL CHECK(json_valid(input_json)), input_digest TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','provisioning','cancelled')),
    created_at TEXT NOT NULL, cancelled_at TEXT, cancelled_by INTEGER,
    prepared_request_json TEXT CHECK(prepared_request_json IS NULL OR json_valid(prepared_request_json)),
    prepared_plan_json TEXT, prepared_plan_digest TEXT, prepared_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS site_provision_request_active_site
    ON site_provision_requests(site_id) WHERE state!='cancelled'`,
  `CREATE INDEX IF NOT EXISTS site_provision_request_tenant_queue ON site_provision_requests(tenant_id,state,created_at,request_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS site_provision_request_prepared_group
    ON site_provision_requests(json_extract(prepared_plan_json,'$.workerGroup'))
    WHERE state='queued' AND prepared_plan_json IS NOT NULL`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_request_immutable BEFORE UPDATE ON site_provision_requests
    WHEN NEW.request_id IS NOT OLD.request_id OR NEW.site_id IS NOT OLD.site_id OR NEW.local_site_id IS NOT OLD.local_site_id
      OR NEW.actor_user_id IS NOT OLD.actor_user_id OR NEW.tenant_id IS NOT OLD.tenant_id
      OR NEW.owner_user_id IS NOT OLD.owner_user_id OR NEW.input_json IS NOT OLD.input_json
      OR NEW.input_digest IS NOT OLD.input_digest OR NEW.created_at IS NOT OLD.created_at
      OR (OLD.prepared_request_json IS NOT NULL AND (NEW.prepared_request_json IS NOT OLD.prepared_request_json
        OR NEW.prepared_plan_json IS NOT OLD.prepared_plan_json OR NEW.prepared_plan_digest IS NOT OLD.prepared_plan_digest
        OR NEW.prepared_at IS NOT OLD.prepared_at))
      OR (NEW.state IS NOT OLD.state AND (OLD.state!='queued' OR NEW.state NOT IN ('cancelled','provisioning')))
    BEGIN SELECT RAISE(ABORT,'Provision request is immutable'); END`,
  // Same D1 statement as the existing reservation: cancellation or permission
  // revocation wins before reservation, otherwise the durable operation wins.
  // An unrelated maintenance operation cannot take a queued request's site ID.
  `CREATE TRIGGER IF NOT EXISTS site_provision_admission_guard BEFORE INSERT ON site_provision_operations
    WHEN NOT EXISTS (SELECT 1 FROM site_provision_operations o WHERE o.operation_id=NEW.operation_id)
      AND EXISTS (SELECT 1 FROM site_provision_requests q WHERE q.request_id=NEW.operation_id
        OR q.local_site_id=NEW.local_site_id OR (q.site_id=NEW.site_id AND q.state!='cancelled'))
    BEGIN
      SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM site_provision_requests q
        WHERE q.request_id=NEW.operation_id AND q.site_id=NEW.site_id AND q.local_site_id=NEW.local_site_id AND q.state='queued'
          AND q.prepared_request_json IS NOT NULL AND q.prepared_plan_json=NEW.plan_json
          AND q.prepared_plan_digest=NEW.plan_digest
          AND ${provisionActorPermission('q.actor_user_id','q.tenant_id')}
          AND ${provisionOwnerPermission('q.owner_user_id','q.tenant_id')}
          AND EXISTS (SELECT 1 FROM tenants t WHERE t.id=q.tenant_id))
        THEN RAISE(ABORT,'Provision admission is cancelled, unprepared or unauthorized') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS site_provision_admission_reserved AFTER INSERT ON site_provision_operations
    BEGIN UPDATE site_provision_requests SET state='provisioning' WHERE request_id=NEW.operation_id AND state='queued'; END`,
] as const

export const provisionAdmissionSchemaObjects = [
  'site_provision_requests','site_provision_request_active_site','site_provision_request_tenant_queue',
  'site_provision_request_prepared_group','site_provision_request_immutable',
  'site_provision_admission_guard','site_provision_admission_reserved',
] as const
