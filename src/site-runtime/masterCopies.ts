import type { PayloadRequest } from 'payload'
import { canonicalMasterJSON, assertMasterReference, masterDigest, masterKey, verifyMasterRelease,
  type MasterReference, type MasterRelease } from '../site-control/masterSnapshot'
import { requireLocalSiteId, requireSiteContext } from './context'
import { createSiteD1Proxy } from './d1'
import { authenticatedSiteUser } from './siteIdentity'
import { assertSitePayloadRequest } from './payloadRequest'
import { masterCopyColumns } from './masterCopyValidation'
import { requireAssetCopy, assetCopySQL } from './assetCopies'

type TenantMapping = { localTenantId: number; centralTenantId: string }
export async function masterOperationContext(req: PayloadRequest) {
  const context = requireSiteContext(), localSiteId = requireLocalSiteId()
  assertSitePayloadRequest(req)
  const user = authenticatedSiteUser(req.user)
  if (req.payload.config.custom.payloadRole !== 'site' || user?.siteRole !== 'manager') throw new Error('Site manager permission required')
  const database = createSiteD1Proxy()
  const tenant = await database.prepare(`SELECT t.id AS localTenantId,t.central_source_record_id AS centralTenantId
    FROM sites s JOIN tenants t ON t.id=s.tenant_id WHERE s.id=?`).bind(localSiteId).first<TenantMapping>()
  if (!tenant || !Number.isSafeInteger(tenant.localTenantId) || tenant.localTenantId < 1 ||
    !/^[1-9][0-9]*$/.test(tenant.centralTenantId) || !Number.isSafeInteger(Number(tenant.centralTenantId))) {
    throw new Error('Provisioned central tenant mapping required')
  }
  const ownership = `EXISTS(SELECT 1 FROM sites s JOIN tenants t ON t.id=s.tenant_id
    WHERE s.id=${localSiteId} AND t.id=${tenant.localTenantId} AND t.central_source_record_id='${tenant.centralTenantId}')`
  return { database,context,localSiteId,tenant,user,ownership }
}
export function assertMasterOperationId(id: string): void {
  if (typeof id !== 'string' || !id || id.length > 128) throw new Error('Explicit master operation ID required')
}
export type MasterCopy = MasterReference & { localId: number; appliedAt: string }

/** Explicit manager action. Every new release gets a new local ID; existing
 * copies and their employee edits are reused, never overwritten. All rows,
 * relationships, mappings and the audit receipt commit in ONE native batch. */
export async function applyMasterRelease(req: PayloadRequest, reference: MasterReference, operationId: string): Promise<MasterCopy> {
  assertMasterReference(reference); assertMasterOperationId(operationId)
  const root = JSON.parse(canonicalMasterJSON(reference)) as MasterReference
  const { database,context,localSiteId,tenant,user,ownership } = await masterOperationContext(req)
  const requestJSON = canonicalMasterJSON({ kind: 'apply',siteId: context.siteId,actor: user.centralUserId,root })
  const digest = await masterDigest(requestJSON)
  const pending = `EXISTS(SELECT 1 FROM site_master_operations WHERE operation_id=? AND request_digest=? AND committed=0)`
  const releases: MasterRelease[] = [], visiting = new Set<string>(), visited = new Map<string,string>()
  let bytes = 0
  const visit = async (ref: MasterReference, depth: number): Promise<void> => {
    const key = masterKey(ref)
    if (visiting.has(key) || depth > 16) throw new Error('Invalid master dependency graph')
    if (visited.has(key)) {
      if (visited.get(key) !== ref.digest) throw new Error('Conflicting master dependency')
      return
    }
    if (visited.size >= 32) throw new Error('Master copy graph limit exceeded')
    const row = await database.prepare(`SELECT snapshot_json AS snapshot,digest,operation_id AS operationId,created_at AS createdAt
      FROM site_master_releases WHERE collection=? AND record_id=? AND revision=?`).bind(ref.collection,ref.recordId,ref.revision)
      .first<{ snapshot: string;digest: string;operationId: string;createdAt: string }>()
    if (!row || row.digest !== ref.digest) throw new Error('Received master version unavailable')
    const release = await verifyMasterRelease({ ...JSON.parse(row.snapshot),digest: row.digest,operationId: row.operationId,createdAt: row.createdAt })
    if (release.tenantId !== 0 && String(release.tenantId) !== tenant.centralTenantId) throw new Error('Cross-tenant master application rejected')
    bytes += new TextEncoder().encode(row.snapshot).length
    if (bytes > 512_000) throw new Error('Master copy byte limit exceeded')
    visiting.add(key); visited.set(key,ref.digest)
    for (const dependency of Object.values(release.relations)) if (dependency) await visit(dependency,depth + 1)
    visiting.delete(key); releases.push(release)
  }
  await visit(root,0)
  const at = new Date().toISOString()
  const statements = [database.prepare(`INSERT INTO site_master_operations(operation_id,request_digest,request_json,kind,actor_id,created_at)
    SELECT ?,?,?,'apply',?,? WHERE ${ownership} ON CONFLICT DO NOTHING`).bind(operationId,digest,requestJSON,user.centralUserId,at)]
  const complete: string[] = []
  for (const release of releases) {
    const table = release.collection.replaceAll('-','_')
    // Fail if a newly introduced master field would need child tables or a
    // different driver representation. No generic arbitrary table/SQL input.
    const columns = await masterCopyColumns(req,release.collection,release.data)
    for (const column of columns) {
      if (column.name === 'slug') column.value = `${column.value || release.collection}--central-${release.recordId}-r${release.revision}`
      if (release.collection === 'offers' && column.name === 'status') column.value = 'draft'
    }
    const identity = `collection='${release.collection}' AND record_id='${release.recordId}' AND revision=${release.revision}`
    const ownCopy = `${identity} AND operation_id=?`
    statements.push(database.prepare(`INSERT INTO site_master_copies(collection,record_id,revision,digest,local_id,operation_id,applied_at)
      SELECT ?,?,?,?,MAX((SELECT COALESCE(MAX(id),0) FROM ${table}),COALESCE((SELECT high_id FROM site_master_id_watermarks WHERE collection='${release.collection}'),0))+1,?,? WHERE ${pending}
      AND NOT EXISTS(SELECT 1 FROM site_master_copies WHERE ${identity}) ON CONFLICT DO NOTHING`)
      .bind(release.collection,release.recordId,release.revision,release.digest,operationId,at,operationId,digest))
    const names = ['id',...columns.map(column => column.name),'tenant_id','central_source_record_id','central_source_revision','central_source_synced_at','created_at','updated_at']
    const values = ['m.local_id',...columns.map(() => '?'),'?','?','?','?','?','?']
    const bindings: (string | number | null)[] = [...columns.map(column => column.value),tenant.localTenantId,release.recordId,release.revision,at,at,at]
    if (release.collection === 'pipeline-profiles') { names.push('is_default'); values.push('0') }
    if (release.collection === 'tenant-prompt-templates') { names.push('master_enabled'); values.push('0') }
    if (release.assets) {
      names.push('headshot_id')
      if (release.assets.headshot) {
        await requireAssetCopy(req,release.assets.headshot)
        values.push(`(${assetCopySQL(release.assets.headshot)})`)
        complete.push(`EXISTS(${assetCopySQL(release.assets.headshot)})`)
      } else values.push('NULL')
    }
    for (const [field,ref] of Object.entries(release.relations)) {
      names.push(field === 'pipelineProfile' ? 'pipeline_profile_id' : 'network_id')
      if (!ref) values.push('NULL')
      else values.push(`(SELECT local_id FROM site_master_copies WHERE collection='${ref.collection}' AND record_id='${ref.recordId}' AND revision=${ref.revision} AND digest='${ref.digest}')`)
    }
    // Parent insert never uses UPSERT: a collision aborts the complete batch.
    statements.push(database.prepare(`INSERT INTO ${table}(${names.map(name => `"${name}"`).join(',')})
      SELECT ${values.join(',')} FROM site_master_copies m WHERE ${ownCopy} AND ${pending}
      AND NOT EXISTS(SELECT 1 FROM ${table} WHERE id=m.local_id)`)
      .bind(...bindings,operationId,operationId,digest))
    if (release.collection === 'authors') statements.push(database.prepare(`INSERT INTO authors_rels("order",parent_id,path,sites_id)
      SELECT 1,m.local_id,'sites',? FROM site_master_copies m WHERE ${ownCopy} AND ${pending}
      AND NOT EXISTS(SELECT 1 FROM authors_rels r WHERE r.parent_id=m.local_id AND r.path='sites' AND r.sites_id=?)`)
      .bind(localSiteId,operationId,operationId,digest,localSiteId))
    complete.push(`EXISTS(SELECT 1 FROM site_master_copies m JOIN ${table} d ON d.id=m.local_id
      WHERE m.${identity.replaceAll(' AND ',' AND m.')} AND m.digest='${release.digest}'
      AND d.central_source_record_id=m.record_id AND d.central_source_revision=m.revision AND d.tenant_id=${tenant.localTenantId})`)
  }
  statements.push(database.prepare(`UPDATE site_master_operations SET committed=CASE WHEN ${ownership} AND ${complete.join(' AND ')} THEN 1 ELSE -1 END
    WHERE operation_id=? AND request_digest=? AND committed=0`).bind(operationId,digest))
  await database.batch(statements)
  const receipt = await database.prepare('SELECT request_digest AS digest,committed FROM site_master_operations WHERE operation_id=?')
    .bind(operationId).first<{ digest: string;committed: number }>()
  if (!receipt || receipt.digest !== digest || receipt.committed !== 1) throw new Error('Master operation or tenant mapping conflict')
  req.payloadDataLoader?.clearAll()
  const copy = await database.prepare(`SELECT local_id AS localId,applied_at AS appliedAt FROM site_master_copies
    WHERE collection=? AND record_id=? AND revision=? AND digest=?`).bind(root.collection,root.recordId,root.revision,root.digest).first<{ localId: number;appliedAt: string }>()
  if (!copy) throw new Error('Applied master copy unavailable')
  return { ...root,...copy }
}
