import { createSiteD1Proxy } from './d1'
import { requireLocalSiteId, requireSiteContext } from './context'
import { assertMasterReference, canonicalMasterJSON, masterKey, snapshotJSON, verifyMasterRelease,
  type MasterBundle, type MasterReference, type MasterRelease } from '../site-control/masterSnapshot'

export type MasterDeliveryCapability = {
  /** A dedicated trusted central RPC. Its implementation must authenticate the
   * calling Worker and site; SHA-256 integrity alone is not authentication. */
  readBundle: (siteId: string, routingVersion: number, reference: MasterReference) => Promise<MasterBundle>
}

/** Receive immutable candidates into this D1 only. Receiving a new revision
 * never updates Payload content, categories, display placement, selected
 * profiles, slugs, or an employee's modified local copy. */
export async function receiveMasterRelease(reference: MasterReference, capability: MasterDeliveryCapability): Promise<void> {
  assertMasterReference(reference)
  const root = JSON.parse(canonicalMasterJSON(reference)) as MasterReference
  const context = requireSiteContext(), localSiteId = requireLocalSiteId()
  const database = createSiteD1Proxy()
  const bundle = await capability.readBundle(context.siteId,context.routingVersion,root)
  requireSiteContext()
  if (!bundle || bundle.siteId !== context.siteId || bundle.localSiteId !== localSiteId || bundle.routingVersion !== context.routingVersion ||
    canonicalMasterJSON(bundle.root) !== canonicalMasterJSON(root)) throw new Error('Master bundle destination mismatch')
  if (!Number.isSafeInteger(bundle.centralTenantId) || bundle.centralTenantId < 1 ||
    !Array.isArray(bundle.releases) || !bundle.releases.length || bundle.releases.length > 32 ||
    new TextEncoder().encode(canonicalMasterJSON(bundle)).length > 512_000) throw new Error('Invalid master bundle')
  const centralTenantId = bundle.centralTenantId
  const releases = new Map<string,MasterRelease>()
  for (const input of bundle.releases) {
    const release = await verifyMasterRelease(input), key = masterKey(release)
    if (release.tenantId !== 0 && release.tenantId !== centralTenantId) throw new Error('Cross-tenant master bundle rejected')
    if (releases.has(key)) throw new Error('Duplicate master bundle identity')
    releases.set(key,release)
  }
  const reached = new Set<string>(), visiting = new Set<string>()
  const visit = (ref: MasterReference, depth: number): void => {
    const key = masterKey(ref), release = releases.get(key)
    if (!release || release.digest !== ref.digest) throw new Error('Pinned master dependency missing')
    if (visiting.has(key) || depth > 16) throw new Error('Master dependency cycle or depth exceeded')
    if (reached.has(key)) return
    visiting.add(key)
    for (const dependency of Object.values(release.relations)) if (dependency) visit(dependency,depth + 1)
    visiting.delete(key); reached.add(key)
  }
  visit(root,0)
  if (reached.size !== releases.size) throw new Error('Unrequested master release in bundle')
  const receivedAt = new Date().toISOString()
  // Validate the *stored* local mapping in the same atomic batch as every
  // insert. A tenant reassignment during the RPC cannot admit the old bundle.
  const ownership = `EXISTS(SELECT 1 FROM sites s JOIN tenants t ON t.id=s.tenant_id
    WHERE s.id=? AND t.central_source_record_id=?)`
  const statements: D1PreparedStatement[] = []
  for (const release of releases.values()) {
    statements.push(database.prepare(`INSERT INTO site_master_releases
      (collection,record_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at,received_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`).bind(release.collection,release.recordId,release.revision,
      release.tenantId,release.digest,snapshotJSON(release),release.operationId,release.createdAt,receivedAt,localSiteId,String(centralTenantId)))
    statements.push(database.prepare(`INSERT INTO site_master_heads(collection,record_id,revision)
      SELECT ?,?,? WHERE ${ownership} ON CONFLICT(collection,record_id)
      DO UPDATE SET revision=excluded.revision WHERE excluded.revision>site_master_heads.revision`)
      .bind(release.collection,release.recordId,release.revision,localSiteId,String(centralTenantId)))
  }
  // A SELECT-only ownership failure must not look like successful delivery.
  statements.push(database.prepare(`SELECT 1 AS valid WHERE ${ownership}`).bind(localSiteId,String(centralTenantId)))
  const results = await database.batch(statements)
  if (results.at(-1)?.results.length !== 1) throw new Error('Provisioned master tenant mapping changed or unavailable')
}
