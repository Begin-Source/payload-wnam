import type { PayloadRequest } from 'payload'
import { canonicalMasterJSON, masterDigest } from '../site-control/masterSnapshot'
import { assertConfigKind, assertConfigReference, projectConfigData, verifyConfigRelease,
  type ConfigKind, type ConfigReference, type ConfigRelease } from '../site-control/configSnapshot'
import { masterOperationContext, assertMasterOperationId } from './masterCopies'
import { validatedScalarColumns } from './masterCopyValidation'
import { requireAssetCopy, assetCopySQL } from './assetCopies'

type SQLRow = Record<string,string | number | null>
export type ConfigReview = { expected: string; data: Record<string,unknown> | null }
const tableName = (kind: ConfigKind) => kind.replaceAll('-','_')
async function readState(db: D1Database, kind: ConfigKind, localSiteId: number) {
  const rows = await db.prepare(`SELECT * FROM ${tableName(kind)}${kind === 'site-quotas' ? ' WHERE site_id=?' : ''} LIMIT 2`)
    .bind(...(kind === 'site-quotas' ? [localSiteId] : [])).all<SQLRow>()
  if (rows.results.length > 1) throw new Error('Ambiguous current configuration; repair duplicate rows first')
  const row = rows.results[0] ?? null
  // Usage is local mutable state, never a policy field or synchronization input.
  if (row && kind === 'site-quotas') delete row.usage_ytd
  const entries = kind === 'prompt-library' && row
    ? (await db.prepare('SELECT * FROM prompt_library_entries WHERE _parent_id=? ORDER BY _order,id').bind(row.id).all<SQLRow>()).results : []
  return { row,entries,digest: await masterDigest(canonicalMasterJSON({ row,entries })) }
}
async function reviewData(req: PayloadRequest, kind: ConfigKind, row: SQLRow | null): Promise<Record<string,unknown> | null> {
  if (!row) return null
  req.payloadDataLoader?.clearAll()
  const source = (kind === 'site-quotas'
    ? await req.payload.findByID({ collection: 'site-quotas',id: Number(row.id),req,depth: 0,overrideAccess: false })
    : await req.payload.findGlobal({ slug: kind,req,depth: 0,overrideAccess: false })) as unknown as Record<string,unknown>
  // Only public configuration fields enter the audit; no provider notes/usage.
  return { ...projectConfigData(kind,source),...(kind === 'admin-branding' ? { logo: source.logo ?? null } : {}) }
}
/** Digest includes actual SQL fields and child rows, not just millisecond
 * timestamps. A same-timestamp editor write must still invalidate review. */
export async function reviewSiteConfig(req: PayloadRequest, kind: ConfigKind): Promise<ConfigReview> {
  assertConfigKind(kind)
  const { database,localSiteId,tenant } = await masterOperationContext(req)
  const state = await readState(database,kind,localSiteId)
  if (kind === 'site-quotas' && state.row && state.row.tenant_id !== tenant.localTenantId) throw new Error('Quota policy tenant mapping mismatch')
  const data = await reviewData(req,kind,state.row)
  if ((await readState(database,kind,localSiteId)).digest !== state.digest) throw new Error('Configuration changed during review')
  return { expected: state.digest,data }
}

/** Explicit application of an already received version. Candidate receipt
 * never calls this. Policy/Global writes, child rows and audit commit together. */
export async function selectSiteConfig(req: PayloadRequest, reference: ConfigReference, expected: string, operationId: string): Promise<void> {
  assertConfigReference(reference); assertMasterOperationId(operationId)
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) throw new Error('Explicit configuration review digest required')
  const ref = JSON.parse(canonicalMasterJSON(reference)) as ConfigReference
  const { database: db,context,tenant,localSiteId,user,ownership } = await masterOperationContext(req)
  const stored = await db.prepare('SELECT snapshot_json,digest,operation_id,created_at FROM site_config_releases WHERE kind=? AND site_id=? AND revision=?')
    .bind(ref.kind,ref.siteId,ref.revision).first<{ snapshot_json: string;digest: string;operation_id: string;created_at: string }>()
  if (!stored || stored.digest !== ref.digest) throw new Error('Received configuration unavailable')
  const release: ConfigRelease = await verifyConfigRelease({ ...JSON.parse(stored.snapshot_json),digest: stored.digest,operationId: stored.operation_id,createdAt: stored.created_at })
  if (release.kind === 'site-quotas' && (release.siteId !== context.siteId || String(release.tenantId) !== tenant.centralTenantId)) throw new Error('Cross-site quota selection rejected')
  const json = canonicalMasterJSON({ siteId: context.siteId,actor: user.centralUserId,reference: ref,expected })
  const digest = await masterDigest(json)
  const existing = await db.prepare('SELECT request_digest,committed FROM site_config_operations WHERE operation_id=?').bind(operationId)
    .first<{ request_digest: string;committed: number }>()
  if (existing) {
    if (existing.request_digest !== digest || existing.committed !== 1) throw new Error('Configuration operation conflict')
    return
  }
  const { row,entries,digest: current } = await readState(db,ref.kind,localSiteId)
  if (ref.kind === 'site-quotas' && row && row.tenant_id !== tenant.localTenantId) throw new Error('Quota policy tenant mapping mismatch')
  if (current !== expected) throw new Error('Configuration changed; review before applying')
  const previous = await reviewData(req,ref.kind,row)
  const data = { ...release.data }; delete data.entries
  const config = ref.kind === 'site-quotas' ? req.payload.collections['site-quotas'].config
    : req.payload.config.globals.find(global => global.slug === ref.kind)!
  const columns = await validatedScalarColumns(req,config.fields,data,ref.kind === 'site-quotas' ? { collectionSlug: ref.kind } : { globalSlug: ref.kind })
  let assetExists = '1'
  if (release.assets) {
    const logo = release.assets.logo
    columns.push({ name: 'logo_id',value: logo ? await requireAssetCopy(req,logo) : null })
    if (logo) assetExists = `EXISTS(${assetCopySQL(logo)})`
  }
  const promptEntries = ref.kind === 'prompt-library' ? release.data.entries as { name: string;body: string }[] : []
  if (promptEntries.length > 200) throw new Error('Prompt entry count limit exceeded')
  if (ref.kind === 'prompt-library') {
    const field = config.fields.find(field => 'name' in field && field.name === 'entries')
    if (!field || field.type !== 'array') throw new Error('Prompt library storage schema changed')
    for (const entry of promptEntries) await validatedScalarColumns(req,field.fields,entry,{ globalSlug: ref.kind })
  }
  const table = tableName(ref.kind),at = new Date().toISOString()
  const id = row?.id ?? Number(await db.prepare(`SELECT COALESCE(MAX(id),0)+1 AS id FROM ${table}`).first('id'))
  const match = row ? `EXISTS(SELECT 1 FROM ${table} WHERE ${Object.keys(row).map(key => `"${key}" IS ?`).join(' AND ')})`
    : `NOT EXISTS(SELECT 1 FROM ${table}${ref.kind === 'site-quotas' ? ` WHERE site_id=${localSiteId}` : ''})`
  const children = ref.kind === 'prompt-library' && row
    ? ` AND (SELECT json_group_array(json_object('_order',_order,'_parent_id',_parent_id,'body',body,'id',id,'name',name))
        FROM (SELECT * FROM prompt_library_entries WHERE _parent_id=${Number(row.id)} ORDER BY _order,id))=?` : ''
  const pending = 'EXISTS(SELECT 1 FROM site_config_operations WHERE operation_id=? AND request_digest=? AND committed=0)'
  const statements = [db.prepare(`INSERT INTO site_config_operations(operation_id,request_digest,request_json,previous_json,actor_id,created_at)
    SELECT ?,?,?,?,?,? WHERE ${ownership} AND ${match}${children} ON CONFLICT DO NOTHING`)
    .bind(operationId,digest,json,canonicalMasterJSON(previous),user.centralUserId,at,...(row ? Object.values(row) : []),...(children ? [canonicalMasterJSON(entries)] : []))]
  columns.push({ name: 'central_source_record_id',value: release.sourceRecordId },{ name: 'central_source_revision',value: release.revision },
    { name: 'central_source_synced_at',value: at },{ name: 'updated_at',value: at })
  if (ref.kind === 'site-quotas') columns.push({ name: 'tenant_id',value: tenant.localTenantId })
  if (row) statements.push(db.prepare(`UPDATE ${table} SET ${columns.map(column => `"${column.name}"=?`).join(',')} WHERE id=? AND ${pending}`)
    .bind(...columns.map(column => column.value),id,operationId,digest))
  else {
    columns.push({ name: 'id',value: id },{ name: 'created_at',value: at })
    if (ref.kind === 'site-quotas') columns.push({ name: 'site_id',value: localSiteId })
    statements.push(db.prepare(`INSERT INTO ${table}(${columns.map(column => `"${column.name}"`).join(',')}) SELECT ${columns.map(() => '?').join(',')} WHERE ${pending}`)
      .bind(...columns.map(column => column.value),operationId,digest))
  }
  if (ref.kind === 'prompt-library') {
    statements.push(db.prepare(`DELETE FROM prompt_library_entries WHERE _parent_id=? AND ${pending}`).bind(id,operationId,digest))
    for (const [index,entry] of promptEntries.entries()) statements.push(db.prepare(`INSERT INTO prompt_library_entries(id,_order,_parent_id,name,body)
      SELECT ?,?,?,?,? WHERE ${pending}`).bind(crypto.randomUUID(),index+1,id,entry.name,entry.body,operationId,digest))
  }
  statements.push(db.prepare(`UPDATE site_config_operations SET committed=CASE WHEN ${ownership} AND ${assetExists} AND EXISTS(SELECT 1 FROM ${table}
    WHERE id=? AND central_source_revision=? AND updated_at=?) THEN 1 ELSE -1 END WHERE operation_id=? AND request_digest=? AND committed=0`)
    .bind(id,release.revision,at,operationId,digest))
  await db.batch(statements)
  const receipt = await db.prepare('SELECT request_digest,committed FROM site_config_operations WHERE operation_id=?').bind(operationId)
    .first<{ request_digest: string;committed: number }>()
  if (!receipt || receipt.request_digest !== digest || receipt.committed !== 1) throw new Error('Configuration changed or operation conflicts; review before applying')
  req.payloadDataLoader?.clearAll()
}
