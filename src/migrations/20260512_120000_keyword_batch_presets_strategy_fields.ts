import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Extra prefill fields for geo_friendly / pillar_sprint / seasonal / refresh_decay batch modes.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('keyword_batch_presets')`)

  if (!cols.some((c) => c.name === 'geo_intent_whitelist')) {
    await db.run(
      sql`ALTER TABLE \`keyword_batch_presets\` ADD \`geo_intent_whitelist\` text DEFAULT 'informational, commercial';`,
    )
  }
  if (!cols.some((c) => c.name === 'geo_question_only')) {
    await db.run(sql`ALTER TABLE \`keyword_batch_presets\` ADD \`geo_question_only\` integer DEFAULT 0;`)
  }
  if (!cols.some((c) => c.name === 'pillar_keyword_id')) {
    await db.run(sql`ALTER TABLE \`keyword_batch_presets\` ADD \`pillar_keyword_id\` numeric;`)
  }
  if (!cols.some((c) => c.name === 'min_seasonal_score')) {
    await db.run(
      sql`ALTER TABLE \`keyword_batch_presets\` ADD \`min_seasonal_score\` numeric DEFAULT 0.7;`,
    )
  }
  if (!cols.some((c) => c.name === 'decay_threshold')) {
    await db.run(sql`ALTER TABLE \`keyword_batch_presets\` ADD \`decay_threshold\` numeric DEFAULT 0.5;`)
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260512_120000_keyword_batch_presets_strategy_fields is irreversible; restore from backup instead.',
  )
}
