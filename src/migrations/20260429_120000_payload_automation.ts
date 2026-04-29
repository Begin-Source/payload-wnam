import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Schema for `@xtr-dev/payload-automation`: collections `automation-triggers`, `automation-steps`,
 * `workflows`, `workflow-runs`, and Payload Jobs (`payload_jobs` / `payload_jobs_log`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const exists = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'automation_triggers'`,
  )
  if (exists?.c) {
    await addLockedDocumentsRelsColumns(db)
    return
  }

  await db.run(sql`CREATE TABLE \`automation_triggers\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`type\` text DEFAULT 'collection-hook' NOT NULL,
  	\`target\` text,
  	\`collection_slug\` text,
  	\`hook\` text,
  	\`global_slug\` text,
  	\`schedule\` text,
  	\`webhook_path\` text,
  	\`condition\` text,
  	\`condition_description\` text,
  	\`usage_count\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`automation_triggers_updated_at_idx\` ON \`automation_triggers\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`automation_triggers_created_at_idx\` ON \`automation_triggers\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`automation_steps\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`type\` text NOT NULL,
  	\`config\` text DEFAULT '{}',
  	\`color\` text DEFAULT '#3b82f6',
  	\`icon\` text,
  	\`input_validation\` text,
  	\`retry_on_failure\` integer DEFAULT false,
  	\`max_retries\` numeric DEFAULT 3,
  	\`retry_delay\` numeric DEFAULT 1000,
  	\`usage_count\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`automation_steps_updated_at_idx\` ON \`automation_steps\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`automation_steps_created_at_idx\` ON \`automation_steps\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`workflows\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`slug\` text,
  	\`read_only\` integer DEFAULT false,
  	\`description\` text,
  	\`enabled\` integer DEFAULT true,
  	\`error_handling\` text DEFAULT 'stop',
  	\`max_retries\` numeric DEFAULT 3,
  	\`retry_delay\` numeric DEFAULT 1000,
  	\`timeout\` numeric DEFAULT 300000,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft'
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`workflows_slug_idx\` ON \`workflows\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`workflows_updated_at_idx\` ON \`workflows\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`workflows_created_at_idx\` ON \`workflows\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`workflows__status_idx\` ON \`workflows\` (\`_status\`);`)

  await db.run(sql`CREATE TABLE \`workflows_steps\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`step_id\` integer,
  	\`slug\` text,
  	\`step_name\` text,
  	\`input_overrides\` text DEFAULT '{}',
  	\`condition\` text,
  	\`position\` text,
  	FOREIGN KEY (\`step_id\`) REFERENCES \`automation_steps\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`workflows\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`workflows_steps_order_idx\` ON \`workflows_steps\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`workflows_steps_parent_id_idx\` ON \`workflows_steps\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`workflows_steps_step_idx\` ON \`workflows_steps\` (\`step_id\`);`)

  await db.run(sql`CREATE TABLE \`workflows_steps_dependencies\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`workflows_steps\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`workflows_steps_dependencies_order_idx\` ON \`workflows_steps_dependencies\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`workflows_steps_dependencies_parent_id_idx\` ON \`workflows_steps_dependencies\` (\`_parent_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`workflows_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`automation_triggers_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`workflows\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`automation_triggers_id\`) REFERENCES \`automation_triggers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`workflows_rels_order_idx\` ON \`workflows_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`workflows_rels_parent_idx\` ON \`workflows_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`workflows_rels_path_idx\` ON \`workflows_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`workflows_rels_automation_triggers_id_idx\` ON \`workflows_rels\` (\`automation_triggers_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`_workflows_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_name\` text,
  	\`version_slug\` text,
  	\`version_read_only\` integer DEFAULT false,
  	\`version_description\` text,
  	\`version_enabled\` integer DEFAULT true,
  	\`version_error_handling\` text DEFAULT 'stop',
  	\`version_max_retries\` numeric DEFAULT 3,
  	\`version_retry_delay\` numeric DEFAULT 1000,
  	\`version_timeout\` numeric DEFAULT 300000,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`workflows\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_workflows_v_parent_idx\` ON \`_workflows_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_workflows_v_version_version_slug_idx\` ON \`_workflows_v\` (\`version_slug\`);`)
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_version_updated_at_idx\` ON \`_workflows_v\` (\`version_updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_version_created_at_idx\` ON \`_workflows_v\` (\`version_created_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_version__status_idx\` ON \`_workflows_v\` (\`version__status\`);`,
  )
  await db.run(sql`CREATE INDEX \`_workflows_v_created_at_idx\` ON \`_workflows_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_workflows_v_updated_at_idx\` ON \`_workflows_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_workflows_v_latest_idx\` ON \`_workflows_v\` (\`latest\`);`)

  await db.run(sql`CREATE TABLE \`_workflows_v_version_steps\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`step_id\` integer,
  	\`slug\` text,
  	\`step_name\` text,
  	\`input_overrides\` text DEFAULT '{}',
  	\`condition\` text,
  	\`position\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`step_id\`) REFERENCES \`automation_steps\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_workflows_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_steps_order_idx\` ON \`_workflows_v_version_steps\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_steps_parent_id_idx\` ON \`_workflows_v_version_steps\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_steps_step_idx\` ON \`_workflows_v_version_steps\` (\`step_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`_workflows_v_version_steps_dependencies\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_workflows_v_version_steps\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_steps_dependencies_order_idx\` ON \`_workflows_v_version_steps_dependencies\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_workflows_v_version_steps_dependencies_parent_id_idx\` ON \`_workflows_v_version_steps_dependencies\` (\`_parent_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`_workflows_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`automation_triggers_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_workflows_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`automation_triggers_id\`) REFERENCES \`automation_triggers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_workflows_v_rels_order_idx\` ON \`_workflows_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_workflows_v_rels_parent_idx\` ON \`_workflows_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_workflows_v_rels_path_idx\` ON \`_workflows_v_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`_workflows_v_rels_automation_triggers_id_idx\` ON \`_workflows_v_rels\` (\`automation_triggers_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`workflow_runs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`workflow_id\` integer NOT NULL,
  	\`workflow_version\` numeric,
  	\`fired_trigger_id\` integer,
  	\`trigger_data\` text,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`started_at\` text NOT NULL,
  	\`completed_at\` text,
  	\`duration\` numeric,
  	\`context\` text,
  	\`inputs\` text DEFAULT '{}',
  	\`outputs\` text,
  	\`triggered_by\` text NOT NULL,
  	\`error\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`workflow_id\`) REFERENCES \`workflows\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`fired_trigger_id\`) REFERENCES \`automation_triggers\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`workflow_runs_workflow_idx\` ON \`workflow_runs\` (\`workflow_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_runs_fired_trigger_idx\` ON \`workflow_runs\` (\`fired_trigger_id\`);`)
  await db.run(sql`CREATE INDEX \`workflow_runs_updated_at_idx\` ON \`workflow_runs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`workflow_runs_created_at_idx\` ON \`workflow_runs\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`workflow_runs_step_results\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`step_id\` integer,
  	\`step_name\` text,
  	\`step_index\` numeric,
  	\`status\` text,
  	\`started_at\` text,
  	\`completed_at\` text,
  	\`duration\` numeric,
  	\`input\` text,
  	\`output\` text,
  	\`error\` text,
  	\`retry_count\` numeric DEFAULT 0,
  	FOREIGN KEY (\`step_id\`) REFERENCES \`automation_steps\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`workflow_runs_step_results_order_idx\` ON \`workflow_runs_step_results\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`workflow_runs_step_results_parent_id_idx\` ON \`workflow_runs_step_results\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`workflow_runs_step_results_step_idx\` ON \`workflow_runs_step_results\` (\`step_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`workflow_runs_logs\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`timestamp\` text,
  	\`level\` text,
  	\`message\` text,
  	\`step_index\` numeric,
  	\`data\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`workflow_runs_logs_order_idx\` ON \`workflow_runs_logs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`workflow_runs_logs_parent_id_idx\` ON \`workflow_runs_logs\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`payload_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`input\` text,
  	\`completed_at\` text,
  	\`total_tried\` numeric DEFAULT 0,
  	\`has_error\` integer DEFAULT false,
  	\`error\` text,
  	\`task_slug\` text,
  	\`queue\` text DEFAULT 'default',
  	\`wait_until\` text,
  	\`processing\` integer DEFAULT false,
  	\`automation_workflow_id\` integer,
  	\`automation_workflow_run_id\` integer,
  	\`automation_trigger_id\` integer,
  	\`automation_step_name\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`automation_workflow_id\`) REFERENCES \`workflows\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`automation_workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`automation_trigger_id\`) REFERENCES \`automation_triggers\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_jobs_completed_at_idx\` ON \`payload_jobs\` (\`completed_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_total_tried_idx\` ON \`payload_jobs\` (\`total_tried\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_has_error_idx\` ON \`payload_jobs\` (\`has_error\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_task_slug_idx\` ON \`payload_jobs\` (\`task_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_queue_idx\` ON \`payload_jobs\` (\`queue\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_wait_until_idx\` ON \`payload_jobs\` (\`wait_until\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_processing_idx\` ON \`payload_jobs\` (\`processing\`);`)
  await db.run(
    sql`CREATE INDEX \`payload_jobs_automation_workflow_idx\` ON \`payload_jobs\` (\`automation_workflow_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_jobs_automation_workflow_run_idx\` ON \`payload_jobs\` (\`automation_workflow_run_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_jobs_automation_trigger_idx\` ON \`payload_jobs\` (\`automation_trigger_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`payload_jobs_updated_at_idx\` ON \`payload_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_created_at_idx\` ON \`payload_jobs\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`payload_jobs_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`executed_at\` text NOT NULL,
  	\`completed_at\` text NOT NULL,
  	\`task_slug\` text NOT NULL,
  	\`task_i_d\` text NOT NULL,
  	\`input\` text,
  	\`output\` text,
  	\`state\` text NOT NULL,
  	\`error\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`)

  await addLockedDocumentsRelsColumns(db)
}

async function addLockedDocumentsRelsColumns(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  const names = new Set(cols.map((c) => c.name))

  if (!names.has('automation_triggers_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`automation_triggers_id\` integer REFERENCES automation_triggers(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_automation_triggers_id_idx\` ON \`payload_locked_documents_rels\` (\`automation_triggers_id\`);`,
    )
  }
  if (!names.has('automation_steps_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`automation_steps_id\` integer REFERENCES automation_steps(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_automation_steps_id_idx\` ON \`payload_locked_documents_rels\` (\`automation_steps_id\`);`,
    )
  }
  if (!names.has('workflows_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`workflows_id\` integer REFERENCES workflows(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_workflows_id_idx\` ON \`payload_locked_documents_rels\` (\`workflows_id\`);`,
    )
  }
  if (!names.has('workflow_runs_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`workflow_runs_id\` integer REFERENCES workflow_runs(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_workflow_runs_id_idx\` ON \`payload_locked_documents_rels\` (\`workflow_runs_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260429_120000_payload_automation is irreversible without manual SQL. Restore from backup instead.',
  )
}
