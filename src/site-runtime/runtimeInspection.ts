import { requireSiteEnvironment,type SiteEnvironment } from '../application-roles/siteEnvironment'
import { assertSiteId } from '../site-control/registry'

/** Current binding proof, independent of the last site's provision operation.
 * Only fixed reads through a named internal service; no SQL or record selector
 * can be supplied by callers, and multiple identity projections are supported. */
export async function inspectSiteRuntime(env: SiteEnvironment,siteId: string) {
  assertSiteId(siteId)
  const binding = requireSiteEnvironment(env).routes.find(route => route.siteId === siteId)
  if (!binding) throw new Error('Site is not bound to this Worker')
  const host = `cms-site-${siteId}.beginos.org`
  const readRoute = () => env.ROUTING.resolve(siteId,host,env.WORKER_GROUP)
  const route = await readRoute()
  if (!route || route.siteId !== siteId || route.localSiteId !== binding.localSiteId || route.databaseId !== binding.databaseId ||
    route.bindingName !== binding.bindingName || route.schemaVersion !== binding.schemaVersion || route.adminHost !== host ||
    route.workerGroup !== env.WORKER_GROUP) throw new Error('Runtime routing mismatch')
  const record = await env[binding.bindingName as `SITE_D1_${string}`].prepare('SELECT id,slug,tenant_id FROM sites WHERE id=?')
    .bind(binding.localSiteId).first<{ id: number; slug: string; tenant_id: number }>()
  if (!record || record.slug !== siteId || !Number.isSafeInteger(record.tenant_id) || record.tenant_id < 1) throw new Error('Runtime site record mismatch')
  const after = await readRoute()
  if (JSON.stringify(route) !== JSON.stringify(after)) throw new Error('Runtime route changed during inspection')
  const provenance = env as SiteEnvironment & { PROVISION_COMMIT?: string; RELEASE_OPERATION?: string }
  if (!/^[a-f0-9]{40}$/.test(provenance.PROVISION_COMMIT ?? '')) throw new Error('Runtime release provenance unavailable')
  return { ...binding,workerGroup: env.WORKER_GROUP,adminHost: host,routingVersion: route.routingVersion,state: route.migrationState,
    tenantId: record.tenant_id,releaseCommit: provenance.PROVISION_COMMIT!,releaseId: provenance.RELEASE_OPERATION ?? null }
}
