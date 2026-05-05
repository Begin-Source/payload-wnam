import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type Col = { name: string; ddl: string }

async function addColumns(db: MigrateUpArgs['db'], table: string, cols: Col[]): Promise<void> {
  for (const { name, ddl } of cols) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${name}\` ${ddl};`))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('duplicate column') && !msg.includes('Duplicate column')) throw e
    }
  }
}

/** T2 stage variants on global + pipeline_profiles; article pipeline snapshot for A/B. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'pipeline_settings', [
    { name: 'brief_variant', ddl: "text DEFAULT 'dfs_serp_first'" },
    { name: 'brief_variant_config', ddl: 'text' },
    { name: 'skeleton_variant', ddl: "text DEFAULT 'single_shot'" },
    { name: 'skeleton_variant_config', ddl: 'text' },
    { name: 'section_variant', ddl: "text DEFAULT 'sequential_context'" },
    { name: 'section_variant_config', ddl: 'text' },
    { name: 'finalize_variant', ddl: "text DEFAULT 'simple_merge'" },
    { name: 'finalize_variant_config', ddl: 'text' },
    { name: 'article_strategy', ddl: 'text' },
    { name: 'brief_depth', ddl: "text DEFAULT 'standard'" },
    { name: 'section_retry_strategy', ddl: 'text' },
  ])

  await addColumns(db, 'pipeline_profiles', [
    { name: 'brief_variant', ddl: 'text' },
    { name: 'brief_variant_config', ddl: 'text' },
    { name: 'skeleton_variant', ddl: 'text' },
    { name: 'skeleton_variant_config', ddl: 'text' },
    { name: 'section_variant', ddl: 'text' },
    { name: 'section_variant_config', ddl: 'text' },
    { name: 'finalize_variant', ddl: 'text' },
    { name: 'finalize_variant_config', ddl: 'text' },
    { name: 'article_strategy', ddl: 'text' },
    { name: 'brief_depth', ddl: 'text' },
    { name: 'section_retry_strategy', ddl: 'text' },
  ])

  await addColumns(db, 'articles', [
    { name: 'pipeline_profile_snapshot', ddl: 'text' },
    { name: 'pipeline_profile_slug', ddl: 'text' },
    { name: 'pipeline_profile_source', ddl: 'text' },
  ])

  try {
    await db.run(
      sql.raw(
        'CREATE INDEX IF NOT EXISTS `articles_pipeline_profile_slug_idx` ON `articles` (`pipeline_profile_slug`);',
      ),
    )
  } catch {
    /* ignore */
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260816_120000_pipeline_t2_variants_and_article_snapshots is irreversible; restore from backup.',
  )
}
