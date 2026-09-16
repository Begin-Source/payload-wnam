import { type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: Pick<MigrateUpArgs, 'db'>): Promise<void> {
  const columns = await db.all<{ name: string }>(sql.raw("PRAGMA table_info('workflow_jobs')"))
  const existing = new Set(columns.map(column => column.name))
  for (const [name, type] of [
    ['lease_token', 'text'], ['lease_expires_at', 'text'], ['heartbeat_at', 'text'],
    ['attempt_count', 'integer DEFAULT 0'], ['error_code', 'text'],
  ]) {
    if (!existing.has(name)) await db.run(sql.raw(`ALTER TABLE workflow_jobs ADD COLUMN ${name} ${type}`))
  }
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS workflow_jobs_claim_idx ON workflow_jobs (status, job_type, lease_expires_at, updated_at)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS workflow_jobs_site_lease_idx ON workflow_jobs (site_id, job_type, status, lease_expires_at)'))
}

export async function down(): Promise<void> {
  // Keep additive columns so existing Worker versions can be rolled back safely.
}
