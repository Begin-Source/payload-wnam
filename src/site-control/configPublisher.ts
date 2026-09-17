import type { PayloadRequest } from 'payload'
import { optionalSiteContext } from '../site-runtime/context'
import { userHasUnscopedAdminAccess } from '../utilities/superAdmin'
import { userHasTenantGeneralManagerRole } from '../utilities/userRoles'
import { parseRelationshipId } from '../utilities/parseRelationshipId'
import { canonicalMasterJSON, masterDigest } from './masterSnapshot'
import { readSiteRegistration } from './registry'
import { assertAssetReference, type AssetReference } from './assetSnapshot'
import { requirePublishedAsset } from './assetPublisher'
import { assertConfigKind, assertConfigReference, configReference, configSnapshotJSON, projectConfigData, verifyConfigRelease,
  type ConfigBundle, type ConfigKind, type ConfigReference, type ConfigRelease, type ConfigSnapshot } from './configSnapshot'

type Row = { snapshot: string; digest: string; operationId: string; createdAt: string }
const columns = 'snapshot_json AS snapshot,digest,operation_id AS operationId,created_at AS createdAt'
const decode = (row: Row) => verifyConfigRelease({ ...JSON.parse(row.snapshot),digest: row.digest,operationId: row.operationId,createdAt: row.createdAt })
function centralOnly() { if (optionalSiteContext()) throw new Error('Central configuration capability inside site request') }

/** Internal primitive; callers authorize source access before committing. */
export async function commitConfigRelease(db: D1Database, snapshot: ConfigSnapshot, operationId: string): Promise<ConfigRelease> {
  centralOnly()
  if (typeof operationId !== 'string' || !operationId || operationId.length > 128) throw new Error('Explicit configuration operation ID required')
  const json = configSnapshotJSON(snapshot), value = JSON.parse(json) as ConfigSnapshot, digest = await masterDigest(json)
  if (value.assets?.logo) await requirePublishedAsset(db,value.assets.logo,0)
  await db.prepare(`INSERT INTO central_config_releases(kind,site_id,revision,tenant_id,digest,snapshot_json,operation_id,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ?=COALESCE((SELECT MAX(revision) FROM central_config_releases WHERE kind=? AND site_id=?),0)
      AND NOT EXISTS(SELECT 1 FROM central_config_releases WHERE kind=? AND site_id=? AND tenant_id!=?) ON CONFLICT DO NOTHING`)
    .bind(value.kind,value.siteId,value.revision,value.tenantId,digest,json,operationId,new Date().toISOString(),value.revision-1,
      value.kind,value.siteId,value.kind,value.siteId,value.tenantId).run()
  const row = await db.prepare(`SELECT ${columns} FROM central_config_releases WHERE operation_id=?`).bind(operationId).first<Row>()
  if (!row || row.digest !== digest || row.snapshot !== json) throw new Error('Configuration revision or operation conflict')
  return decode(row)
}
export async function readConfigRelease(db: D1Database, ref: ConfigReference): Promise<ConfigRelease> {
  centralOnly(); assertConfigReference(ref)
  const row = await db.prepare(`SELECT ${columns} FROM central_config_releases WHERE kind=? AND site_id=? AND revision=?`)
    .bind(ref.kind,ref.siteId,ref.revision).first<Row>()
  if (!row || row.digest !== ref.digest) throw new Error('Configuration release unavailable')
  return decode(row)
}
export type PublishConfigInput = { kind: ConfigKind; sourceRecordId: string; expectedRevision: number; expectedUpdatedAt: string; operationId: string; assets?: { logo: AssetReference | null } }
export async function publishConfigFromPayload(db: D1Database, req: PayloadRequest, input: PublishConfigInput): Promise<ConfigRelease> {
  centralOnly(); assertConfigKind(input.kind)
  if (req.payload.config.custom.payloadRole !== 'central' || !req.user ||
    !(userHasUnscopedAdminAccess(req.user) || (input.kind === 'site-quotas' && userHasTenantGeneralManagerRole(req.user)))) throw new Error('Central configuration publisher permission required')
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
    typeof input.sourceRecordId !== 'string' || !/^[1-9][0-9]*$/.test(input.sourceRecordId)) throw new Error('Explicit configuration source and revision required')
  const source = (input.kind === 'site-quotas'
    ? await req.payload.findByID({ collection: 'site-quotas',id: input.sourceRecordId,req,depth: 0,overrideAccess: false })
    : await req.payload.findGlobal({ slug: input.kind,req,depth: 0,overrideAccess: false })) as unknown as Record<string,unknown>
  if (String(source.id) !== input.sourceRecordId) throw new Error('Configuration source identity changed')
  let siteId = '',tenantId = 0
  if (input.kind === 'site-quotas') {
    const site = await req.payload.findByID({ collection: 'sites',id: parseRelationshipId(source.site)!,req,depth: 0,overrideAccess: false }) as unknown as Record<string,unknown>
    siteId = String(site.runtimeSiteId)
    tenantId = parseRelationshipId(site.tenant) ?? 0
    if (!tenantId || parseRelationshipId(source.tenant) !== tenantId || !await readSiteRegistration(db,siteId)) throw new Error('Registered quota site and matching tenant required')
  }
  const prior = await db.prepare(`SELECT ${columns} FROM central_config_releases WHERE operation_id=?`).bind(input.operationId).first<Row>()
  if (prior) {
    const release = await decode(prior)
    if (release.kind !== input.kind || release.siteId !== siteId || release.tenantId !== tenantId || release.sourceRecordId !== input.sourceRecordId ||
      release.sourceUpdatedAt !== input.expectedUpdatedAt || release.revision !== input.expectedRevision+1 ||
      canonicalMasterJSON(release.assets ?? null) !== canonicalMasterJSON(input.assets ?? null)) throw new Error('Configuration operation conflict')
    return release
  }
  if (source.updatedAt !== input.expectedUpdatedAt) throw new Error('Configuration source changed; refresh before publishing')
  if (input.kind === 'admin-branding') {
    if (!input.assets || Object.keys(input.assets).join(',') !== 'logo') throw new Error('Explicit branding asset mapping required')
    if (input.assets.logo !== null) assertAssetReference(input.assets.logo)
    const sourceId = parseRelationshipId(source.logo)
    if (sourceId === null ? input.assets.logo !== null : input.assets.logo?.recordId !== String(sourceId)) throw new Error('Branding logo source mismatch')
  } else if (input.assets !== undefined) throw new Error('Unexpected configuration assets')
  return commitConfigRelease(db,{ format: input.assets ? 2 : 1,kind: input.kind,siteId,tenantId,sourceRecordId: input.sourceRecordId,
    sourceUpdatedAt: input.expectedUpdatedAt,revision: input.expectedRevision+1,data: projectConfigData(input.kind,source),
    ...(input.assets ? { assets: input.assets } : {}) },input.operationId)
}

/** Internal authenticated transport must authorize the calling site's identity. */
export async function exportConfigBundle(db: D1Database, siteId: string, routingVersion: number, ref: ConfigReference): Promise<ConfigBundle> {
  centralOnly(); assertConfigReference(ref)
  const registration = await readSiteRegistration(db,siteId)
  if (!registration || registration.routingVersion !== routingVersion || !['active','provisioning'].includes(registration.migrationState)) throw new Error('Configuration routing unavailable')
  const tenant = await db.prepare('SELECT tenant_id FROM sites WHERE runtime_site_id=?').bind(siteId).first<number>('tenant_id')
  if (!Number.isSafeInteger(tenant) || tenant! < 1) throw new Error('Configuration tenant unavailable')
  const release = await readConfigRelease(db,ref)
  if (release.assets?.logo) await requirePublishedAsset(db,release.assets.logo,0)
  if (release.kind === 'site-quotas' && (release.siteId !== siteId || release.tenantId !== tenant)) throw new Error('Cross-site quota policy rejected')
  const current = await readSiteRegistration(db,siteId)
  const currentTenant = await db.prepare('SELECT tenant_id FROM sites WHERE runtime_site_id=?').bind(siteId).first<number>('tenant_id')
  if (!current || canonicalMasterJSON(current) !== canonicalMasterJSON(registration) || currentTenant !== tenant) throw new Error('Configuration routing changed')
  return { siteId,localSiteId: registration.localSiteId,routingVersion,centralTenantId: tenant!,release: { ...release,...configReference(release) } }
}
