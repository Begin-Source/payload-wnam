import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * Replace legacy Global-era `announcements` table with the `announcements` collection
 * (multi-tenant, system vs team, team lead + author).
 * Migrates any rows from the old table as `kind = system` (first tenant when present).
 * Idempotent: skips if `announcements` already has `tenant_id`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'announcements'`,
  )
  if (!tableCheck?.c) {
    await createAnnouncementsTable(db)
    await addLockedDocumentsRelsColumn(db)
    return
  }

  const columns = await db.all<TableInfoRow>(sql`PRAGMA table_info('announcements')`)
  if (columns.some((c) => c.name === 'tenant_id')) {
    await addLockedDocumentsRelsColumn(db)
    return
  }

  await db.run(sql`PRAGMA foreign_keys=OFF;`)

  await db.run(sql`ALTER TABLE \`announcements\` RENAME TO \`announcements_legacy\`;`)

  await createAnnouncementsTable(db)

  await db.run(sql`
    INSERT INTO \`announcements\` (
      \`id\`, \`tenant_id\`, \`kind\`, \`team_lead_id\`, \`author_id\`,
      \`title\`, \`body\`, \`is_active\`, \`is_pinned\`, \`starts_at\`, \`ends_at\`, \`updated_at\`, \`created_at\`
    )
    SELECT
      l.\`id\`,
      (SELECT \`id\` FROM \`tenants\` ORDER BY \`id\` LIMIT 1),
      'system',
      NULL,
      NULL,
      l.\`title\`,
      l.\`body\`,
      COALESCE(l.\`is_active\`, 1),
      0,
      l.\`starts_at\`,
      l.\`ends_at\`,
      COALESCE(l.\`updated_at\`, l.\`created_at\`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      COALESCE(l.\`created_at\`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    FROM \`announcements_legacy\` l;
  `)

  await db.run(sql`DROP TABLE \`announcements_legacy\`;`)

  await addLockedDocumentsRelsColumn(db)

  await db.run(sql`PRAGMA foreign_keys=ON;`)
}

async function createAnnouncementsTable(db: MigrateUpArgs['db']): Promise<void> {
  await db.run(sql`CREATE TABLE \`announcements\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tenant_id\` integer,
  	\`kind\` text DEFAULT 'system' NOT NULL,
  	\`team_lead_id\` integer,
  	\`author_id\` integer,
  	\`title\` text NOT NULL,
  	\`body\` text NOT NULL,
  	\`is_active\` integer DEFAULT 1,
  	\`is_pinned\` integer DEFAULT 0,
  	\`starts_at\` text,
  	\`ends_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`team_lead_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`announcements_tenant_idx\` ON \`announcements\` (\`tenant_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`announcements_team_lead_idx\` ON \`announcements\` (\`team_lead_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`announcements_author_idx\` ON \`announcements\` (\`author_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`announcements_updated_at_idx\` ON \`announcements\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`announcements_created_at_idx\` ON \`announcements\` (\`created_at\`);`,
  )
}

async function addLockedDocumentsRelsColumn(db: MigrateUpArgs['db']): Promise<void> {
  const relCols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  if (relCols.some((c) => c.name === 'announcements_id')) {
    return
  }
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`announcements_id\` integer REFERENCES announcements(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_announcements_id_idx\` ON \`payload_locked_documents_rels\` (\`announcements_id\`);`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260421_150000_announcements_collection is irreversible without manual data remapping. Restore from backup instead.',
  )
}
