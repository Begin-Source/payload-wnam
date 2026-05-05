import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'

/**
 * Historical placeholder: seeding ran too early (before T2 columns existed on `pipeline_profiles`)
 * and broke remote migrate. Real seed lives in `20260818_120000_seed_seo_theory_pipeline_profiles`.
 * Keeps migration name stable for `payload_migrations` bookkeeping.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260815_120000_seed_seo_theory_pipeline_profiles is a no-op; see 20260818_120000_seed_seo_theory_pipeline_profiles.',
  )
}
