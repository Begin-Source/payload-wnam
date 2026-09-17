function releases(prefix: 'central' | 'site'): string[] {
  const table = `${prefix}_config_releases`
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (
      kind TEXT NOT NULL,site_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),tenant_id INTEGER NOT NULL,
      digest TEXT NOT NULL,snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),operation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,PRIMARY KEY(kind,site_id,revision)${prefix === 'central' ? ',UNIQUE(operation_id)' : ''})`,
    ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER IF NOT EXISTS ${table}_no_${op.toLowerCase()} BEFORE ${op} ON ${table}
      BEGIN SELECT RAISE(ABORT,'Configuration releases are immutable'); END`),
    `CREATE TRIGGER IF NOT EXISTS ${table}_conflict BEFORE INSERT ON ${table}
      WHEN EXISTS(SELECT 1 FROM ${table} WHERE kind=NEW.kind AND site_id=NEW.site_id AND revision=NEW.revision AND digest!=NEW.digest)
      BEGIN SELECT RAISE(ABORT,'Conflicting configuration release'); END`,
  ]
}
export async function migrateCentralConfigs(db: D1Database): Promise<void> {
  await db.batch(releases('central').map(sql => db.prepare(sql)))
}
/** Run explicitly after independent site Payload schema. No onInit migration. */
export async function migrateSiteConfigs(db: D1Database): Promise<void> {
  await db.batch([...releases('site'),
    `CREATE TABLE IF NOT EXISTS site_config_operations (
      operation_id TEXT PRIMARY KEY,request_digest TEXT NOT NULL,request_json TEXT NOT NULL CHECK(json_valid(request_json)),
      previous_json TEXT NOT NULL CHECK(json_valid(previous_json)),actor_id TEXT NOT NULL,created_at TEXT NOT NULL,
      committed INTEGER NOT NULL DEFAULT 0 CHECK(committed IN(0,1)))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS site_quotas_single_policy ON site_quotas(site_id)`,
  ].map(sql => db.prepare(sql)))
}
