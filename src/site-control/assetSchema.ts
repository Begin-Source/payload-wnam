function releases(prefix: 'central' | 'site') {
  return [`CREATE TABLE IF NOT EXISTS ${prefix}_asset_releases (
    record_id TEXT NOT NULL,revision INTEGER NOT NULL,tenant_id INTEGER NOT NULL,digest TEXT NOT NULL,
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),operation_id TEXT NOT NULL,created_at TEXT NOT NULL,
    PRIMARY KEY(record_id,revision)${prefix === 'central' ? ',UNIQUE(operation_id)' : ''})`,
  ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER IF NOT EXISTS ${prefix}_asset_release_no_${op.toLowerCase()}
    BEFORE ${op} ON ${prefix}_asset_releases BEGIN SELECT RAISE(ABORT,'Asset releases are immutable'); END`),
  `CREATE TRIGGER IF NOT EXISTS ${prefix}_asset_release_conflict BEFORE INSERT ON ${prefix}_asset_releases
    WHEN EXISTS(SELECT 1 FROM ${prefix}_asset_releases WHERE record_id=NEW.record_id AND revision=NEW.revision AND digest!=NEW.digest)
    BEGIN SELECT RAISE(ABORT,'Conflicting asset version'); END`,
  `CREATE TABLE IF NOT EXISTS ${prefix}_asset_withdrawals (
    record_id TEXT NOT NULL,revision INTEGER NOT NULL,digest TEXT NOT NULL,operation_id TEXT NOT NULL UNIQUE,
    withdrawn_at TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(record_id,revision))`,
  ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER IF NOT EXISTS ${prefix}_asset_withdrawal_no_${op.toLowerCase()}
    BEFORE ${op} ON ${prefix}_asset_withdrawals BEGIN SELECT RAISE(ABORT,'Asset withdrawals are irreversible'); END`)]
}
export async function migrateCentralAssets(db: D1Database): Promise<void> {
  await db.batch([...releases('central'),`CREATE TABLE IF NOT EXISTS central_asset_publications (
    operation_id TEXT PRIMARY KEY,request_json TEXT NOT NULL,snapshot_json TEXT NOT NULL,digest TEXT NOT NULL,created_at TEXT NOT NULL,
    committed INTEGER NOT NULL DEFAULT 0 CHECK(committed IN(0,1)))`].map(sql => db.prepare(sql)))
}
export async function migrateSiteAssets(db: D1Database): Promise<void> {
  await db.batch([...releases('site'),
    `CREATE TABLE IF NOT EXISTS site_asset_copies (record_id TEXT NOT NULL,revision INTEGER NOT NULL,digest TEXT NOT NULL,
      local_id INTEGER NOT NULL UNIQUE,filename TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,PRIMARY KEY(record_id,revision))`,
    `CREATE TABLE IF NOT EXISTS site_asset_operations (operation_id TEXT PRIMARY KEY,request_json TEXT NOT NULL,kind TEXT NOT NULL,
      created_at TEXT NOT NULL,committed INTEGER NOT NULL DEFAULT 0 CHECK(committed IN(0,1)))`,
    `CREATE TABLE IF NOT EXISTS site_asset_id_watermark (singleton INTEGER PRIMARY KEY CHECK(singleton=1),high_id INTEGER NOT NULL)`,
    `INSERT INTO site_asset_id_watermark SELECT 1,COALESCE(MAX(id),0) FROM media WHERE true ON CONFLICT(singleton) DO UPDATE SET high_id=MAX(high_id,excluded.high_id)`,
    ...['INSERT','UPDATE OF id'].map((op,i) => `CREATE TRIGGER IF NOT EXISTS asset_media_high_id_${i} AFTER ${op} ON media
      BEGIN UPDATE site_asset_id_watermark SET high_id=MAX(high_id,NEW.id) WHERE singleton=1; END`),
    ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER IF NOT EXISTS asset_copies_no_${op.toLowerCase()} BEFORE ${op} ON site_asset_copies
      BEGIN SELECT RAISE(ABORT,'Asset copy mappings are immutable'); END`),
    `CREATE TRIGGER IF NOT EXISTS asset_media_no_delete BEFORE DELETE ON media WHEN EXISTS(SELECT 1 FROM site_asset_copies WHERE local_id=OLD.id)
      BEGIN SELECT RAISE(ABORT,'Withdraw versioned assets without deleting their identity'); END`,
    `CREATE TRIGGER IF NOT EXISTS asset_media_no_update BEFORE UPDATE ON media WHEN EXISTS(SELECT 1 FROM site_asset_copies WHERE local_id=OLD.id)
      BEGIN SELECT RAISE(ABORT,'Versioned asset media is immutable'); END`,
    `CREATE TRIGGER IF NOT EXISTS asset_media_no_replacement BEFORE INSERT ON media WHEN EXISTS(SELECT 1 FROM site_asset_copies WHERE local_id=NEW.id AND
      (filename IS NOT NEW.filename OR record_id IS NOT NEW.central_source_record_id OR revision IS NOT NEW.central_source_revision))
      BEGIN SELECT RAISE(ABORT,'Versioned asset media identity cannot be replaced'); END`,
  ].map(sql => db.prepare(sql)))
}
