import type { PayloadRequest } from 'payload'
import { optionalSiteContext } from '../site-runtime/context'
import { userHasUnscopedAdminAccess } from '../utilities/superAdmin'
import { userHasTenantGeneralManagerRole } from '../utilities/userRoles'
import { parseRelationshipId } from '../utilities/parseRelationshipId'
import { readSiteRegistration } from './registry'
import { assertMasterCollection, assertMasterReference, canonicalMasterJSON, masterDigest, masterKey, masterReference,
  masterRelations, projectMasterData, snapshotJSON, verifyMasterRelease,
  type MasterBundle, type MasterCollection, type MasterReference, type MasterRelease, type MasterSnapshot } from './masterSnapshot'

type ReleaseRow = { snapshot: string; digest: string; operationId: string; createdAt: string }
const columns = 'snapshot_json AS snapshot,digest,operation_id AS operationId,created_at AS createdAt'
const decode = (row: ReleaseRow): Promise<MasterRelease> => verifyMasterRelease({ ...JSON.parse(row.snapshot),
  digest: row.digest, operationId: row.operationId, createdAt: row.createdAt })
function centralOnly(): void { if (optionalSiteContext()) throw new Error('Central master capability used inside a site request') }

export async function readMasterRelease(database: D1Database, ref: MasterReference): Promise<MasterRelease> {
  centralOnly(); assertMasterReference(ref)
  const row = await database.prepare(`SELECT ${columns} FROM central_master_releases WHERE collection=? AND record_id=? AND revision=?`)
    .bind(ref.collection,ref.recordId,ref.revision).first<ReleaseRow>()
  if (!row || row.digest !== ref.digest) throw new Error('Pinned master release unavailable')
  return decode(row)
}

/** Internal storage primitive. Callers must have authorized the central source.
 * INSERT ... SELECT performs revision CAS at the write, including concurrent
 * first publication. A caller-generated operation ID makes exact retries safe. */
export async function commitMasterRelease(database: D1Database, snapshot: MasterSnapshot, operationId: string): Promise<MasterRelease> {
  centralOnly()
  if (typeof operationId !== 'string' || !operationId || operationId.length > 128) throw new Error('Master operation ID required')
  const json = snapshotJSON(snapshot)
  // Detach caller objects before the first await.
  const value = JSON.parse(json) as MasterSnapshot
  const digest = await masterDigest(json)
  for (const ref of Object.values(value.relations)) if (ref) {
    const dependency = await readMasterRelease(database,ref)
    if (dependency.tenantId !== value.tenantId && dependency.tenantId !== 0) throw new Error('Cross-tenant master dependency')
  }
  await database.prepare(`INSERT INTO central_master_releases
    (collection,record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ?=COALESCE((SELECT MAX(revision) FROM central_master_releases WHERE collection=? AND record_id=?),0)
      AND NOT EXISTS(SELECT 1 FROM central_master_releases WHERE collection=? AND record_id=? AND tenant_id!=?)
    ON CONFLICT DO NOTHING`).bind(value.collection,value.recordId,value.revision,value.tenantId,digest,json,operationId,new Date().toISOString(),
    value.revision - 1,value.collection,value.recordId,value.collection,value.recordId,value.tenantId).run()
  const row = await database.prepare(`SELECT ${columns} FROM central_master_releases WHERE operation_id=?`).bind(operationId).first<ReleaseRow>()
  if (!row || row.digest !== digest || row.snapshot !== json) throw new Error('Master revision or operation conflict')
  return decode(row)
}

export type PublishMasterInput = {
  collection: MasterCollection; recordId: string; expectedRevision: number; expectedUpdatedAt: string
  operationId: string; relations: Record<string,MasterReference | null>
}
/** Reads through the independent central Payload's actual role/tenant access.
 * No caller-supplied content, local relationship IDs or overrideAccess bypass. */
export async function publishMasterFromPayload(database: D1Database, req: PayloadRequest, input: PublishMasterInput): Promise<MasterRelease> {
  centralOnly(); assertMasterCollection(input.collection)
  if (req.payload.config.custom.payloadRole !== 'central' || !req.user ||
    !(userHasUnscopedAdminAccess(req.user) || userHasTenantGeneralManagerRole(req.user))) throw new Error('Central master publisher permission required')
  if (input.collection === 'site-layouts' && !userHasUnscopedAdminAccess(req.user)) throw new Error('Global master publisher permission required')
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('Expected master revision required')
  assertMasterReference({ collection: input.collection, recordId: input.recordId, revision: input.expectedRevision + 1, digest: '0'.repeat(64) })
  const source = await req.payload.findByID({ collection: input.collection, id: input.recordId, depth: 0, req, overrideAccess: false }) as unknown as Record<string,unknown>
  const tenantId = input.collection === 'site-layouts' ? 0 : parseRelationshipId(source.tenant)
  if (tenantId === null) throw new Error('Master source tenant required')
  const prior = await database.prepare(`SELECT ${columns} FROM central_master_releases WHERE operation_id=?`).bind(input.operationId).first<ReleaseRow>()
  if (prior) {
    const release = await decode(prior)
    if (release.collection !== input.collection || release.recordId !== input.recordId || release.revision !== input.expectedRevision + 1 ||
      release.sourceUpdatedAt !== input.expectedUpdatedAt || release.tenantId !== tenantId ||
      canonicalMasterJSON(release.relations) !== canonicalMasterJSON(input.relations)) throw new Error('Master operation conflict')
    return release
  }
  if (source.updatedAt !== input.expectedUpdatedAt) throw new Error('Master source changed; refresh before publishing')
  const expectedRelations = masterRelations[input.collection] ?? {}
  if (Object.keys(input.relations).length !== Object.keys(expectedRelations).length) throw new Error('Explicit master relationship mapping required')
  for (const key of Object.keys(expectedRelations)) {
    const sourceId = parseRelationshipId(source[key]), ref = input.relations[key]
    if (sourceId === null ? ref !== null : ref?.recordId !== String(sourceId)) throw new Error('Master relationship source mismatch')
  }
  return commitMasterRelease(database,{ format: 1, collection: input.collection, recordId: input.recordId, tenantId,
    revision: input.expectedRevision + 1, sourceUpdatedAt: input.expectedUpdatedAt,
    data: projectMasterData(input.collection,source), relations: input.relations },input.operationId)
}

/** Trusted service-binding transport calls this only after authenticating its
 * target site. This function is not a browser endpoint or an authentication
 * substitute. Export is scoped to the registered site's current central tenant. */
export async function exportMasterBundle(database: D1Database, siteId: string, routingVersion: number, root: MasterReference): Promise<MasterBundle> {
  centralOnly(); assertMasterReference(root)
  const site = await readSiteRegistration(database,siteId)
  if (!site || site.routingVersion !== routingVersion || !['active','provisioning'].includes(site.migrationState)) throw new Error('Master delivery routing unavailable')
  const centralTenantId = await database.prepare('SELECT tenant_id FROM sites WHERE runtime_site_id=?').bind(siteId).first<number>('tenant_id')
  if (!Number.isSafeInteger(centralTenantId) || centralTenantId! < 1) throw new Error('Central site tenant unavailable')
  const releases: MasterRelease[] = [], found = new Map<string,MasterRelease>()
  let bytes = 0
  const visit = async (ref: MasterReference, depth: number): Promise<void> => {
    const key = masterKey(ref), previous = found.get(key)
    if (previous) {
      if (previous.digest !== ref.digest) throw new Error('Conflicting pinned dependency')
      return
    }
    if (depth > 16 || found.size >= 32) throw new Error('Master bundle dependency limit exceeded')
    const release = await readMasterRelease(database,ref)
    if (release.tenantId !== centralTenantId && release.tenantId !== 0) throw new Error('Cross-tenant master delivery rejected')
    bytes += new TextEncoder().encode(canonicalMasterJSON(release)).length
    if (bytes > 512_000) throw new Error('Master bundle byte limit exceeded')
    found.set(key,release)
    for (const dependency of Object.values(release.relations)) if (dependency) await visit(dependency,depth + 1)
    releases.push(release)
  }
  await visit(root,0)
  // Catch a route/tenant transfer while the dependency graph was being read.
  const current = await readSiteRegistration(database,siteId)
  const currentTenant = await database.prepare('SELECT tenant_id FROM sites WHERE runtime_site_id=?').bind(siteId).first<number>('tenant_id')
  if (!current || current.routingVersion !== routingVersion || currentTenant !== centralTenantId) throw new Error('Master delivery routing changed')
  const bundle = { siteId, localSiteId: site.localSiteId, routingVersion, centralTenantId: centralTenantId!, root: masterReference(found.get(masterKey(root))!), releases }
  if (new TextEncoder().encode(canonicalMasterJSON(bundle)).length > 512_000) throw new Error('Master bundle byte limit exceeded')
  return bundle
}
