export type SiteState = 'provisioning' | 'active' | 'paused' | 'migrating' | 'retired'
export type SiteRegistration = Readonly<{
  siteId: string; databaseId: string; bindingName: string; workerGroup: string
  adminHost: string; schemaVersion: number; routingVersion: number
  migrationState: SiteState; timezone: string; productionEnabled: boolean; operationId: string
}>

export function assertSiteId(siteId: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(siteId)) throw new Error('Invalid stable site ID')
}

export function assertAdminHost(siteId: string, host: string): void {
  assertSiteId(siteId)
  if (host !== `cms-site-${siteId}.beginos.org`) throw new Error('Untrusted site admin host')
}

const columns = `site_id AS siteId, database_id AS databaseId, binding_name AS bindingName,
 worker_group AS workerGroup, admin_host AS adminHost, schema_version AS schemaVersion,
 routing_version AS routingVersion, migration_state AS migrationState, timezone,
 production_enabled AS productionEnabled, operation_id AS operationId`

export async function readSiteRegistration(database: D1Database, siteId: string): Promise<SiteRegistration | null> {
  assertSiteId(siteId)
  const row = await database.prepare(`SELECT ${columns} FROM site_runtime_registry WHERE site_id = ?`).bind(siteId)
    .first<Omit<SiteRegistration, 'productionEnabled'> & { productionEnabled: number }>()
  if (!row) return null
  assertAdminHost(row.siteId, row.adminHost)
  return Object.freeze({ ...row, productionEnabled: row.productionEnabled === 1 })
}

/** Restricted provisioning path, not a browser API. A retry cannot repoint a site. */
export async function registerSite(database: D1Database, site: SiteRegistration): Promise<void> {
  assertAdminHost(site.siteId, site.adminHost)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(site.databaseId) || !/^SITE_D1_[A-Z0-9_]+$/.test(site.bindingName) ||
    !/^[a-z0-9-]{1,64}$/.test(site.workerGroup) || !site.operationId || site.operationId.length > 128 ||
    !Number.isSafeInteger(site.schemaVersion) || site.schemaVersion < 1 ||
    !Number.isSafeInteger(site.routingVersion) || site.routingVersion < 1 ||
    typeof site.productionEnabled !== 'boolean' || typeof site.timezone !== 'string' || !site.timezone ||
    !['provisioning','active','paused','migrating','retired'].includes(site.migrationState)) throw new Error('Invalid site registration')
  new Intl.DateTimeFormat('en', { timeZone: site.timezone })
  await database.prepare(`INSERT INTO site_runtime_registry
    (site_id,database_id,binding_name,worker_group,admin_host,schema_version,routing_version,migration_state,timezone,production_enabled,operation_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(site_id) DO NOTHING`).bind(
    site.siteId, site.databaseId, site.bindingName, site.workerGroup, site.adminHost,
    site.schemaVersion, site.routingVersion, site.migrationState, site.timezone, Number(site.productionEnabled), site.operationId,
  ).run()
  const current = await readSiteRegistration(database, site.siteId)
  if (!current || Object.keys(site).some(key => current[key as keyof SiteRegistration] !== site[key as keyof SiteRegistration])) {
    throw new Error('Site registration conflicts with existing operation or routing')
  }
}

/** All state changes invalidate tickets/sessions from the previous route version. */
export async function transitionSiteState(database: D1Database, siteId: string, expectedVersion: number, state: SiteState): Promise<number> {
  assertSiteId(siteId)
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
    !['active', 'paused', 'migrating', 'retired'].includes(state)) throw new Error('Invalid site transition')
  const row = await database.prepare(`UPDATE site_runtime_registry SET migration_state = ?, routing_version = routing_version + 1
    WHERE site_id = ? AND routing_version = ? AND migration_state != 'retired' RETURNING routing_version AS version`)
    .bind(state, siteId, expectedVersion).first<{ version: number }>()
  if (!row) throw new Error('Site routing changed or site retired')
  return row.version
}

export type CrossSiteReference = Readonly<{ siteId: string; collection: string; recordId: string | number }>
export function crossSiteReference(siteId: string, collection: string, recordId: string | number): CrossSiteReference {
  assertSiteId(siteId)
  if (!/^[a-z][a-z0-9-]*$/.test(collection) ||
    (typeof recordId === 'number' ? !Number.isSafeInteger(recordId) || recordId < 1 : !recordId || recordId.length > 128)) {
    throw new Error('Invalid cross-site reference')
  }
  return Object.freeze({ siteId, collection, recordId })
}
