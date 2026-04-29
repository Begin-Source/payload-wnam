import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

/**
 * SEO pipeline (20260430) added 5 collections but did not add matching FK columns on
 * `payload_locked_documents_rels`, breaking Admin `getIsLocked` / document view (blank content area).
 * Idempotent: skips any column that already exists.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addLockedDocumentsRelsColumns(db)
}

async function addLockedDocumentsRelsColumns(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('payload_locked_documents_rels')`)
  const names = new Set(cols.map((c) => c.name))

  if (!names.has('content_briefs_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`content_briefs_id\` integer REFERENCES content_briefs(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_content_briefs_id_idx\` ON \`payload_locked_documents_rels\` (\`content_briefs_id\`);`,
    )
  }
  if (!names.has('serp_snapshots_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`serp_snapshots_id\` integer REFERENCES serp_snapshots(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_serp_snapshots_id_idx\` ON \`payload_locked_documents_rels\` (\`serp_snapshots_id\`);`,
    )
  }
  if (!names.has('authors_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`authors_id\` integer REFERENCES authors(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`,
    )
  }
  if (!names.has('original_evidence_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`original_evidence_id\` integer REFERENCES original_evidence(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_original_evidence_id_idx\` ON \`payload_locked_documents_rels\` (\`original_evidence_id\`);`,
    )
  }
  if (!names.has('page_link_graph_id')) {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`page_link_graph_id\` integer REFERENCES page_link_graph(id);`,
    )
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_page_link_graph_id_idx\` ON \`payload_locked_documents_rels\` (\`page_link_graph_id\`);`,
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('20260430_130000_fix_locked_docs_rels: down not supported.')
}
