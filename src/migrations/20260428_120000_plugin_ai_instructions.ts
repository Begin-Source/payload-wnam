import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Tables for `@ai-stack/payloadcms` collection `plugin-ai-instructions` (D1 table `plugin_ai_*`).
 * Without these, `GET /plugin-ai/fetch-fields` calls `find` and returns 500 (`no such table`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const exists = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'plugin_ai_instructions'`,
  )
  if (exists?.c) {
    await addLockedDocumentsRelsColumn(db)
    return
  }

  await db.run(sql`CREATE TABLE \`plugin_ai_instructions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`schema_path\` text,
  	\`field_type\` text DEFAULT 'text',
  	\`relation_to\` text,
  	\`model_id\` text,
  	\`disabled\` integer DEFAULT 0,
  	\`prompt\` text,
  	\`system\` text,
  	\`layout\` text,
  	\`oai_text_settings_model\` text,
  	\`oai_text_settings_max_tokens\` numeric,
  	\`oai_text_settings_temperature\` numeric,
  	\`oai_text_settings_extract_attachments\` integer,
  	\`dalle_e_settings_version\` text,
  	\`dalle_e_settings_size\` text,
  	\`dalle_e_settings_style\` text,
  	\`dalle_e_settings_enable_prompt_optimization\` integer,
  	\`gpt_image_1_settings_version\` text,
  	\`gpt_image_1_settings_size\` text,
  	\`gpt_image_1_settings_quality\` text,
  	\`gpt_image_1_settings_output_format\` text,
  	\`gpt_image_1_settings_output_compression\` numeric,
  	\`gpt_image_1_settings_background\` text,
  	\`gpt_image_1_settings_moderation\` text,
  	\`oai_tts_settings_voice\` text,
  	\`oai_tts_settings_model\` text,
  	\`oai_tts_settings_response_format\` text,
  	\`oai_tts_settings_speed\` numeric,
  	\`oai_object_settings_model\` text,
  	\`oai_object_settings_max_tokens\` numeric,
  	\`oai_object_settings_temperature\` numeric,
  	\`oai_object_settings_extract_attachments\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)

  await db.run(
    sql`CREATE UNIQUE INDEX \`plugin_ai_instructions_schema_path_idx\` ON \`plugin_ai_instructions\` (\`schema_path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`plugin_ai_instructions_updated_at_idx\` ON \`plugin_ai_instructions\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`plugin_ai_instructions_created_at_idx\` ON \`plugin_ai_instructions\` (\`created_at\`);`,
  )

  await db.run(sql`CREATE TABLE \`plugin_ai_instructions_images\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`plugin_ai_instructions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)

  await db.run(
    sql`CREATE INDEX \`plugin_ai_instructions_images_order_idx\` ON \`plugin_ai_instructions_images\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`plugin_ai_instructions_images_parent_id_idx\` ON \`plugin_ai_instructions_images\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`plugin_ai_instructions_images_image_idx\` ON \`plugin_ai_instructions_images\` (\`image_id\`);`,
  )

  await addLockedDocumentsRelsColumn(db)
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'plugin_ai_instructions_id')) {
    return
  }
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`plugin_ai_instructions_id\` integer REFERENCES plugin_ai_instructions(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_plugin_ai_instructions_id_idx\` ON \`payload_locked_documents_rels\` (\`plugin_ai_instructions_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260428_120000_plugin_ai_instructions is irreversible without manual SQL. Restore from backup instead.',
  )
}
