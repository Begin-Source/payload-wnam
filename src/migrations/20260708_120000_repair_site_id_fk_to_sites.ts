import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Some DBs still have `categories.site_id` referencing the migration backup table
 * `sites_mig_old_20260629` (only legacy ids). Saving `site_id` to a real `sites.id`
 * then fails with SQLITE_CONSTRAINT FOREIGN KEY.
 *
 * Rebuild `categories` with `site_id` → `sites(id)` only (same pattern as
 * `20260703_120000_repair_site_blueprints_site_id_fk_sites`). Other collections
 * are not touched here because a full multi-table rebuild can fail on D1 when
 * `DROP TABLE` hits parent rows while foreign keys stay enforced per statement.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const rows = await db.all<{ sql: string | null }>(
    sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'categories'`,
  )
  const ddl = rows[0]?.sql
  if (!ddl || !ddl.includes('sites_mig_old_20260629')) return

  await db.run(sql`PRAGMA foreign_keys = OFF`)

  await db.run(sql.raw(`
CREATE TABLE \`__new_categories\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`tenant_id\` integer,
  \`name\` text NOT NULL,
  \`slug\` text NOT NULL,
  \`description\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`site_id\` integer REFERENCES \`sites\`(\`id\`) ON UPDATE no action ON DELETE set null,
  \`slot_index\` numeric,
  \`category_slots_workflow_status\` text DEFAULT 'idle',
  FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null
)`))

  await db.run(sql`INSERT INTO \`__new_categories\` SELECT * FROM \`categories\``)

  await db.run(sql`DROP INDEX IF EXISTS \`categories_tenant_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`categories_slug_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`categories_updated_at_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`categories_created_at_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`categories_site_idx\``)
  await db.run(sql`DROP INDEX IF EXISTS \`categories_site_slot_uidx\``)

  await db.run(sql`DROP TABLE \`categories\``)
  await db.run(sql`ALTER TABLE \`__new_categories\` RENAME TO \`categories\``)

  await db.run(sql`CREATE INDEX \`categories_tenant_idx\` ON \`categories\` (\`tenant_id\`)`)
  await db.run(sql`CREATE INDEX \`categories_slug_idx\` ON \`categories\` (\`slug\`)`)
  await db.run(sql`CREATE INDEX \`categories_updated_at_idx\` ON \`categories\` (\`updated_at\`)`)
  await db.run(sql`CREATE INDEX \`categories_created_at_idx\` ON \`categories\` (\`created_at\`)`)
  await db.run(sql`CREATE INDEX \`categories_site_idx\` ON \`categories\` (\`site_id\`)`)
  await db.run(
    sql.raw(
      `CREATE UNIQUE INDEX \`categories_site_slot_uidx\` ON \`categories\` (\`site_id\`, \`slot_index\`) WHERE \`slot_index\` IS NOT NULL`,
    ),
  )

  await db.run(sql`PRAGMA foreign_keys = ON`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`SELECT 1`)
}
