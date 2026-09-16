import { type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: Pick<MigrateUpArgs, 'db'>): Promise<void> {
  await db.run(sql.raw('CREATE TABLE IF NOT EXISTS pipeline_auth_nonces (nonce_hash TEXT PRIMARY KEY NOT NULL, expires_at TEXT NOT NULL)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS pipeline_auth_nonces_expiry_idx ON pipeline_auth_nonces (expires_at)'))
}

export async function down(): Promise<void> {
  // Retain replay records if application code is rolled back.
}
