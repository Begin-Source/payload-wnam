/** Explicit migrations, not factory/onInit DDL. Release rows are append-only.
 * The heads below identify available versions, never the site's active choice. */
export const centralMasterSchema = [
  `CREATE TABLE IF NOT EXISTS central_master_releases (
    collection TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
    tenant_id INTEGER NOT NULL CHECK(tenant_id >= 0), digest TEXT NOT NULL,
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), operation_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, PRIMARY KEY(collection,record_id,revision)
  )`,
  `CREATE TRIGGER IF NOT EXISTS central_master_no_update BEFORE UPDATE ON central_master_releases
    BEGIN SELECT RAISE(ABORT,'Master releases are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS central_master_no_delete BEFORE DELETE ON central_master_releases
    BEGIN SELECT RAISE(ABORT,'Master releases are immutable'); END`,
] as const
export const siteMasterSchema = [
  `CREATE TABLE IF NOT EXISTS site_master_releases (
    collection TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
    tenant_id INTEGER NOT NULL CHECK(tenant_id >= 0), digest TEXT NOT NULL,
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), operation_id TEXT NOT NULL,
    created_at TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(collection,record_id,revision)
  )`,
  `CREATE TABLE IF NOT EXISTS site_master_heads (
    collection TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL,
    PRIMARY KEY(collection,record_id),
    FOREIGN KEY(collection,record_id,revision) REFERENCES site_master_releases(collection,record_id,revision)
  )`,
  `CREATE TRIGGER IF NOT EXISTS site_master_conflicting_insert BEFORE INSERT ON site_master_releases
    WHEN EXISTS(SELECT 1 FROM site_master_releases WHERE collection=NEW.collection AND record_id=NEW.record_id
      AND revision=NEW.revision AND digest!=NEW.digest)
    BEGIN SELECT RAISE(ABORT,'Conflicting master release'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_master_no_update BEFORE UPDATE ON site_master_releases
    BEGIN SELECT RAISE(ABORT,'Master releases are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS site_master_no_delete BEFORE DELETE ON site_master_releases
    BEGIN SELECT RAISE(ABORT,'Master releases are immutable'); END`,
] as const
export async function migrateCentralMasters(database: D1Database): Promise<void> {
  await database.batch(centralMasterSchema.map(sql => database.prepare(sql)))
}
export async function migrateSiteMasters(database: D1Database): Promise<void> {
  await database.batch(siteMasterSchema.map(sql => database.prepare(sql)))
}
