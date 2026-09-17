import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { SiteRegistration } from '../../src/site-control/registry'
import { roleSchemaDigest,type RoleSchema } from '../p1-schema'

const identifier = (name: string) => {
  assert.match(name,/^[a-zA-Z_][a-zA-Z0-9_]*$/,'Invalid schema identifier')
  return `"${name}"`
}
const canonical = (sql: string) => sql.trim().replace(/;$/,'')
type Column = { name: string; type: string; pk: number }
type Row = Record<string,unknown>
export type VerifyOwnership = { kind: 'provision'; operationId: string } | { kind: 'p1'; operationId: string; role: 'site-a' | 'site-b' }
type Options = { database: D1Database; site: SiteRegistration; schema: RoleSchema; schemaDigest: string; accountId: string;
  ownership: VerifyOwnership; publicBucket: R2Bucket; privateBucket: R2Bucket; progress?: (table: string) => void }

function taskReferences(value: unknown,site: SiteRegistration) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { for (const item of value) taskReferences(item,site); return }
  const row = value as Row
  if (row.siteId !== undefined) assert.equal(row.siteId,site.siteId,'Task references another stable site')
  if (row.localSiteId !== undefined) assert.equal(row.localSiteId,site.localSiteId,'Task references another local site')
  for (const item of Object.values(row)) taskReferences(item,site)
}

/** Maintenance-side full-table reads through explicitly selected native D1.
 * Bounded pages and streaming media hashes; no content/credential row is
 * returned. Two matching inventories detect ordinary concurrent changes but
 * are not a transactional migration snapshot or a substitute for freezing. */
export async function verifySiteDatabase(options: Options) {
  const { database: db,site,schema,schemaDigest,ownership } = options
  assert.equal(roleSchemaDigest(schema.objects),schemaDigest,'Checked schema artifact digest mismatch')
  const receiptName = ownership.kind === 'provision' ? 'site_schema_bootstrap' : 'p1_schema_bootstrap'
  const inventory = async () => (await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name")
    .all<RoleSchema['objects'][number]>()).results
  const checkSchema = async () => {
    const actual = (await inventory()).filter(item => item.name !== receiptName)
    assert.equal(actual.length,schema.objects.length,'Site schema object count mismatch')
    for (const item of actual) {
      const expected = schema.objects.find(candidate => candidate.name === item.name)
      assert.ok(expected && expected.type === item.type && canonical(expected.sql) === canonical(item.sql),`Site schema drift: ${item.name}`)
    }
    const receipt = await db.prepare(`SELECT * FROM ${identifier(receiptName)} WHERE id=1`).first<Row>()
    assert.ok(receipt && receipt.operation_id === ownership.operationId && receipt.digest === schemaDigest && receipt.completed === 1,'Site schema receipt mismatch')
    if (ownership.kind === 'provision') assert.ok(receipt.site_id === site.siteId && receipt.database_id === site.databaseId && receipt.account_id === options.accountId &&
      receipt.schema_version === site.schemaVersion && ownership.operationId === site.operationId,'Site schema ownership mismatch')
    else assert.equal(receipt.role,ownership.role,'P1 role receipt mismatch')
  }
  await checkSchema()
  const records = (await db.prepare('SELECT id,slug,tenant_id FROM sites').all<{ id: number; slug: string; tenant_id: number }>()).results
  assert.ok(records.length === 1 && records[0].id === site.localSiteId && records[0].slug === site.siteId,'Database contains an unexpected site record')
  const tenantId = records[0].tenant_id
  const tables = schema.objects.filter(item => item.type === 'table').sort((a,b) => a.name.localeCompare(b.name))
  const columns = new Map<string,Column[]>()
  for (const table of tables) {
    assert.ok(!/WITHOUT\s+ROWID/i.test(table.sql),'WITHOUT ROWID verification requires a primary-key cursor')
    columns.set(table.name,(await db.prepare(`PRAGMA table_info(${identifier(table.name)})`).all<Column>()).results)
  }
  const scan = async (inspect: boolean) => {
    const result: { table: string; rows: number; digest: string }[] = []
    for (const table of tables) {
      const fields = columns.get(table.name)!,hash = createHash('sha256')
      assert.ok(!fields.some(field => ['rowid','_rowid_','oid','__verify_cursor'].includes(field.name)),'Schema shadows verification cursor')
      let cursor: number | null = null,count = 0
      for (;;) {
        const statement = db.prepare(`SELECT _rowid_ AS __verify_cursor,* FROM ${identifier(table.name)} ${cursor === null ? '' : 'WHERE _rowid_>?'} ORDER BY _rowid_ LIMIT 50`)
        const rows: Row[] = (await (cursor === null ? statement : statement.bind(cursor)).all<Row>()).results
        if (!rows.length) break
        for (const row of rows) {
          assert.ok(Number.isSafeInteger(row.__verify_cursor),'Unsafe D1 row cursor')
          cursor = row.__verify_cursor as number
          hash.update(JSON.stringify(fields.map(field => row[field.name]))+'\n'); count++
          if (!inspect) continue
          for (const field of fields) {
            const value = row[field.name]
            if (value == null) continue
            if (/(^|_)site_id$/.test(field.name)) {
              const expected = /INT|NUM|REAL/i.test(field.type) ? site.localSiteId : site.siteId
              assert.equal(value,expected,`Cross-site row in ${table.name}.${field.name}`)
            }
            if (/^(payload_jobs|workflow_jobs|workflow_runs)(_|$)/.test(table.name) && typeof value === 'string' && /^[\[{]/.test(value)) {
              let json: unknown
              try { json = JSON.parse(value) } catch { continue }
              taskReferences(json,site)
            }
          }
        }
      }
      result.push({ table: table.name,rows: count,digest: hash.digest('hex') }); options.progress?.(table.name)
    }
    return result
  }
  const foreignKeys = async () => {
    const violations = (await db.prepare('PRAGMA foreign_key_check').all<{ table: string }>()).results
    assert.equal(violations.length,0,'Site has dangling SQL relationships')
  }
  await foreignKeys()
  const content = await scan(true)
  let objects = 0,pendingMedia = 0,withdrawnMedia = 0
  const mediaHash = createHash('sha256')
  for (const [table,bucket] of [['media',options.publicBucket],['private_media',options.privateBucket]] as const) {
    assert.ok(columns.has(table),'Site upload table missing')
    let cursor = 0
    for (;;) {
      const rows = (await db.prepare(`SELECT * FROM ${identifier(table)} WHERE id>? ORDER BY id LIMIT 50`).bind(cursor).all<Row>()).results
      if (!rows.length) break
      for (const row of rows) {
        assert.ok(Number.isSafeInteger(row.id) && Number(row.id) > cursor,'Invalid media cursor'); cursor = Number(row.id)
        if (!row.filename) { pendingMedia++; continue }
        const relative = [row.prefix,row.filename].filter(Boolean).join('/')
        assert.ok(!relative.startsWith('/') && !relative.includes('\\') && !relative.includes('\0') &&
          !relative.split('/').some(part => !part || part === '.' || part === '..'),'Unsafe media object path')
        const key = `sites/${site.siteId}/${relative}`,object = await bucket.get(key)
        let withdrawn = false
        if (table === 'media' && row.central_source_record_id != null) {
          withdrawn = Boolean(await db.prepare('SELECT 1 FROM site_asset_withdrawals WHERE record_id=? AND revision=?')
            .bind(row.central_source_record_id,row.central_source_revision).first())
        }
        if (withdrawn) {
          assert.ok(!object || object.customMetadata?.assetWithdrawn === '1','Withdrawn asset is still exposed')
          await object?.body.cancel(); withdrawnMedia++; continue
        }
        assert.ok(object && object.customMetadata?.assetWithdrawn !== '1',`Missing media object in ${table}`)
        assert.ok(object.size <= 64*1024*1024,'Media exceeds the explicit verification byte limit')
        if (row.filesize != null) assert.equal(object.size,row.filesize,'Media size differs from database')
        const hash = createHash('sha256'),reader = object.body.getReader()
        let bytes = 0
        for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; hash.update(part.value) }
        assert.equal(bytes,object.size,'Media stream was truncated')
        mediaHash.update(JSON.stringify({ table,id: row.id,key,size: bytes,digest: hash.digest('hex') })+'\n'); objects++
      }
    }
  }
  await foreignKeys(); await checkSchema()
  const after = await scan(false)
  assert.ok(JSON.stringify(after) === JSON.stringify(content),'Site data changed during verification; rerun or freeze before comparison')
  return { siteId: site.siteId,localSiteId: site.localSiteId,tenantId,schemaVersion: site.schemaVersion,schemaDigest,
    tables: content,contentDigest: createHash('sha256').update(JSON.stringify(content)).digest('hex'),sqlRelationships: 'passed' as const,
    media: { objects,pendingMedia,withdrawnMedia,digest: mediaHash.digest('hex') },
    tasks: content.filter(item => /^(payload_jobs|workflow_jobs|workflow_runs)(_|$)/.test(item.table)),
    consistency: 'two-matching-inventories-not-a-transactional-snapshot' as const }
}
