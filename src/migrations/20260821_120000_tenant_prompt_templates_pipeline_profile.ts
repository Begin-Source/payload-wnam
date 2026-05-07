import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Optional SEO pipeline profile scope for tenant prompt rows.
 * Replaces (tenant_id, key) unique with partial uniques: global default vs per-profile.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('tenant_prompt_templates')`)
  if (!cols.some((c) => c.name === 'pipeline_profile_id')) {
    await db.run(sql`
      ALTER TABLE \`tenant_prompt_templates\`
      ADD \`pipeline_profile_id\` integer REFERENCES \`pipeline_profiles\`(\`id\`) ON UPDATE no action ON DELETE cascade;
    `)
  }

  await db.run(
    sql`DROP INDEX IF EXISTS \`tenant_prompt_templates_tenant_key_unique\`;`,
  )

  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`tenant_prompt_templates_tenant_key_global_unique\`
      ON \`tenant_prompt_templates\` (\`tenant_id\`, \`key\`)
      WHERE \`pipeline_profile_id\` IS NULL;`,
  )
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`tenant_prompt_templates_tenant_key_profile_unique\`
      ON \`tenant_prompt_templates\` (\`tenant_id\`, \`key\`, \`pipeline_profile_id\`)
      WHERE \`pipeline_profile_id\` IS NOT NULL;`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`tenant_prompt_templates_pipeline_profile_id_idx\`
      ON \`tenant_prompt_templates\` (\`pipeline_profile_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260821_120000_tenant_prompt_templates_pipeline_profile is irreversible; restore from backup instead.',
  )
}
