import { requireSiteEnvironment, type SiteEnvironment } from '../application-roles/siteEnvironment'
import { assertSiteId } from '../site-control/registry'

/** Read-only internal capability. No client-selected SQL, binding or local ID. */
export async function inspectProvisionedSite(env: SiteEnvironment,siteId: string,operationId: string) {
  assertSiteId(siteId)
  if (!/^[a-f0-9-]{36}$/.test(operationId)) throw new Error('Explicit provision operation required')
  const provenance = env as SiteEnvironment & { PROVISION_OPERATION?: string; PROVISION_COMMIT?: string }
  if (provenance.PROVISION_OPERATION !== operationId || !/^[a-f0-9]{40}$/.test(provenance.PROVISION_COMMIT ?? '')) throw new Error('Provision deployment provenance mismatch')
  const binding = requireSiteEnvironment(env).routes.find(route => route.siteId === siteId)
  if (!binding) throw new Error('Site is not bound to this Worker')
  const host = `cms-site-${siteId}.beginos.org`
  const route = await env.ROUTING.resolve(siteId,host,env.WORKER_GROUP)
  if (!route || route.siteId !== binding.siteId || route.databaseId !== binding.databaseId || route.bindingName !== binding.bindingName ||
    route.localSiteId !== binding.localSiteId || route.schemaVersion !== binding.schemaVersion || route.workerGroup !== env.WORKER_GROUP ||
    route.adminHost !== host || !['provisioning','active'].includes(route.migrationState)) throw new Error('Provision routing mismatch')
  const database = env[binding.bindingName as `SITE_D1_${string}`]
  const ownership = await database.prepare('SELECT operation_id,site_id,database_id,digest,schema_version,completed FROM site_schema_bootstrap WHERE id=1')
    .first<{ operation_id: string; site_id: string; database_id: string; digest: string; schema_version: number; completed: number }>()
  if (!ownership || ownership.operation_id !== operationId || ownership.site_id !== siteId || ownership.database_id !== binding.databaseId ||
    ownership.schema_version !== binding.schemaVersion || ownership.completed !== 1) throw new Error('Provision database ownership mismatch')
  const record = await database.prepare('SELECT id,slug,tenant_id FROM sites WHERE id=?').bind(binding.localSiteId)
    .first<{ id: number; slug: string; tenant_id: number }>()
  if (!record || record.slug !== siteId) throw new Error('Provision site record missing')
  const tenant = await database.prepare('SELECT central_source_record_id AS sourceId FROM tenants WHERE id=?').bind(record.tenant_id).first<{ sourceId: string }>()
  const users = (await database.prepare('SELECT id,central_user_id AS centralUserId FROM users ORDER BY id LIMIT 2').all<{ id: number; centralUserId: string }>()).results
  if (!tenant || users.length !== 1) throw new Error('Provision projections incomplete')
  return { siteId,operationId,releaseCommit: provenance.PROVISION_COMMIT!,databaseId: binding.databaseId,bindingName: binding.bindingName,localSiteId: record.id,
    tenantId: record.tenant_id,centralTenantId: tenant.sourceId,ownerUserId: users[0].centralUserId,
    schemaDigest: ownership.digest,schemaVersion: ownership.schema_version,routingVersion: route.routingVersion,state: route.migrationState }
}
