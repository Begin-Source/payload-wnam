import { masterFields } from '../site-control/masterSnapshot'

/** Install after the independent site's Payload schema and candidate tables.
 * Native batch transactions make a failed application leave no partial copy. */
export const siteMasterCopySchema = [
  `CREATE TABLE IF NOT EXISTS site_master_id_watermarks (
    collection TEXT PRIMARY KEY, high_id INTEGER NOT NULL CHECK(high_id>=0 AND high_id<=9007199254740991)
  )`,
  `CREATE TABLE IF NOT EXISTS site_master_operations (
    operation_id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, request_json TEXT NOT NULL CHECK(json_valid(request_json)), kind TEXT NOT NULL,
    actor_id TEXT NOT NULL, committed INTEGER NOT NULL DEFAULT 0 CHECK(committed IN (0,1)), created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS site_master_copies (
    collection TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL,
    digest TEXT NOT NULL, local_id INTEGER NOT NULL CHECK(local_id>0 AND local_id<=9007199254740991), operation_id TEXT NOT NULL,
    applied_at TEXT NOT NULL, PRIMARY KEY(collection,record_id,revision), UNIQUE(collection,local_id),
    FOREIGN KEY(collection,record_id,revision) REFERENCES site_master_releases(collection,record_id,revision),
    FOREIGN KEY(operation_id) REFERENCES site_master_operations(operation_id)
  )`,
  ...['UPDATE','DELETE'].map(operation => `CREATE TRIGGER IF NOT EXISTS master_copy_no_${operation.toLowerCase()}
    BEFORE ${operation} ON site_master_copies BEGIN SELECT RAISE(ABORT,'Master copy identities are immutable'); END`),
  ...Object.keys(masterFields).map(collection => {
    const table = collection.replaceAll('-','_')
    return `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_master_version ON ${table}(central_source_record_id,central_source_revision)`
  }),
  ...Object.keys(masterFields).flatMap(collection => {
    const table = collection.replaceAll('-','_')
    return [
      `INSERT INTO site_master_id_watermarks(collection,high_id) SELECT '${collection}',COALESCE(MAX(id),0) FROM ${table} WHERE true
        ON CONFLICT(collection) DO UPDATE SET high_id=MAX(site_master_id_watermarks.high_id,excluded.high_id)`,
      ...['INSERT','UPDATE OF id'].map((operation,index) => `CREATE TRIGGER IF NOT EXISTS ${table}_master_id_watermark_${index}
        AFTER ${operation} ON ${table} BEGIN
          INSERT INTO site_master_id_watermarks(collection,high_id) VALUES ('${collection}',NEW.id)
          ON CONFLICT(collection) DO UPDATE SET high_id=MAX(site_master_id_watermarks.high_id,excluded.high_id);
        END`),
      ...['INSERT','UPDATE'].map(operation => `CREATE TRIGGER IF NOT EXISTS ${table}_master_identity_${operation.toLowerCase()}
        BEFORE ${operation} ON ${table} WHEN EXISTS(SELECT 1 FROM site_master_copies m WHERE m.collection='${collection}' AND m.local_id=NEW.id
          AND (NEW.central_source_record_id IS NOT m.record_id OR NEW.central_source_revision IS NOT m.revision))
        BEGIN SELECT RAISE(ABORT,'Master copy identity cannot be replaced'); END`),
      `CREATE TRIGGER IF NOT EXISTS ${table}_master_identity_delete BEFORE DELETE ON ${table}
        WHEN EXISTS(SELECT 1 FROM site_master_copies m WHERE m.collection='${collection}' AND m.local_id=OLD.id)
        BEGIN SELECT RAISE(ABORT,'Master copy identity cannot be deleted'); END`,
      `CREATE TRIGGER IF NOT EXISTS ${table}_master_identity_move BEFORE UPDATE OF id ON ${table}
        WHEN NEW.id IS NOT OLD.id AND EXISTS(SELECT 1 FROM site_master_copies m WHERE m.collection='${collection}' AND m.local_id=OLD.id)
        BEGIN SELECT RAISE(ABORT,'Master copy identity cannot be moved'); END`,
    ]
  }),
  `CREATE UNIQUE INDEX IF NOT EXISTS authors_local_slug ON authors(slug) WHERE slug IS NOT NULL AND slug!=''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pipeline_profiles_local_slug ON pipeline_profiles(tenant_id,slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS keyword_batch_presets_local_slug ON keyword_batch_presets(tenant_id,slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_prompt_templates_active_key ON tenant_prompt_templates(tenant_id,key,COALESCE(pipeline_profile_id,0)) WHERE master_enabled=1`,
] as const

export async function migrateSiteMasterCopies(database: D1Database): Promise<void> {
  await database.batch(siteMasterCopySchema.map(sql => database.prepare(sql)))
}
