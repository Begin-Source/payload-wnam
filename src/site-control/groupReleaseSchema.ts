/** Ordinary group uploads share central exclusion with new-site reservations.
 * Pending external effects survive lease expiry and require reconciliation. */
export const groupReleaseSchema = [
  `CREATE TABLE IF NOT EXISTS site_group_leases (
    worker_group TEXT PRIMARY KEY, lease_owner TEXT NOT NULL,
    lease_epoch INTEGER NOT NULL, lease_until INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS site_group_releases (
    release_id TEXT PRIMARY KEY,worker_group TEXT NOT NULL,commit_sha TEXT NOT NULL,
    manifest_digest TEXT NOT NULL,manifest_json TEXT NOT NULL,expected_deployment_id TEXT NOT NULL,
    receipt_json TEXT,created_at TEXT NOT NULL,completed_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS site_group_release_pending
    ON site_group_releases(worker_group) WHERE completed_at IS NULL`,
] as const
export const groupReleaseSchemaObjects = ['site_group_leases','site_group_releases','site_group_release_pending'] as const
