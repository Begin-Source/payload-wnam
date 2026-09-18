import { canonicalMasterJSON } from '../site-control/masterSnapshot'
import { assertConfigReference, configReference, configSnapshotJSON, verifyConfigRelease, type ConfigReference, type ConfigBundle } from '../site-control/configSnapshot'
import { requireSiteContext, requireLocalSiteId } from './context'
import { createSiteD1Proxy } from './d1'

export type ConfigDeliveryCapability = { readConfig: (siteId: string, routingVersion: number, ref: ConfigReference) => Promise<ConfigBundle> }
/** Candidate delivery never changes the active Global or quota policy. */
export async function receiveConfigRelease(ref: ConfigReference, capability: ConfigDeliveryCapability): Promise<void> {
  assertConfigReference(ref)
  const root = JSON.parse(canonicalMasterJSON(ref)) as ConfigReference
  const context = requireSiteContext(),localSiteId = requireLocalSiteId(),db = createSiteD1Proxy()
  const bundle = await capability.readConfig(context.siteId,context.routingVersion,root)
  requireSiteContext()
  if (!bundle || bundle.siteId !== context.siteId || bundle.routingVersion !== context.routingVersion || bundle.localSiteId !== localSiteId ||
    !Number.isSafeInteger(bundle.centralTenantId) || bundle.centralTenantId < 1) throw new Error('Configuration destination mismatch')
  const release = await verifyConfigRelease(bundle.release)
  if (canonicalMasterJSON(configReference(release)) !== canonicalMasterJSON(root) ||
    (release.kind === 'site-quotas' && (release.siteId !== context.siteId || release.tenantId !== bundle.centralTenantId))) throw new Error('Configuration scope mismatch')
  const ownership = 'EXISTS(SELECT 1 FROM sites s JOIN tenants t ON t.id=s.tenant_id WHERE s.id=? AND t.central_source_record_id=?)'
  const result = await db.batch([
    db.prepare(`INSERT INTO site_config_releases(kind,site_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${ownership} ON CONFLICT DO NOTHING`).bind(release.kind,release.siteId,release.revision,release.tenantId,release.digest,
      configSnapshotJSON(release),release.operationId,release.createdAt,localSiteId,String(bundle.centralTenantId)),
    db.prepare(`SELECT 1 AS valid WHERE ${ownership}`).bind(localSiteId,String(bundle.centralTenantId)),
  ])
  if (result[1].results.length !== 1) throw new Error('Configuration tenant mapping changed')
}

export async function hasConfigCandidate(ref: ConfigReference): Promise<boolean> {
  try {
    assertConfigReference(ref)
    const row = await createSiteD1Proxy().prepare(`SELECT snapshot_json AS snapshot,digest,operation_id AS operationId,created_at AS createdAt
      FROM site_config_releases WHERE kind=? AND site_id=? AND revision=?`).bind(ref.kind,ref.siteId,ref.revision)
      .first<{ snapshot: string;digest: string;operationId: string;createdAt: string }>()
    if (!row || row.digest !== ref.digest) return false
    const release = await verifyConfigRelease({ ...JSON.parse(row.snapshot),digest: row.digest,operationId: row.operationId,createdAt: row.createdAt })
    return canonicalMasterJSON(configReference(release)) === canonicalMasterJSON(ref)
  } catch { return false }
}
