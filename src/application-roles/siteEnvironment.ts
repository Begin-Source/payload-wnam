import type { SiteIdentityRPC } from '../site-control/identityService'
import type { SiteDataRPC } from '../site-control/dataDelivery'
import type { SiteRoutingRPC } from '../site-control/routingService'
import { assertSiteId } from '../site-control/registry'

export type SiteBinding = Readonly<{ siteId: string; localSiteId: number; bindingName: string; databaseId: string; schemaVersion: number }>
export type SiteEnvironment = {
  IDENTITY: SiteIdentityRPC; DATA: SiteDataRPC; ROUTING: SiteRoutingRPC
  SITE_PUBLIC: R2Bucket; SITE_PRIVATE: R2Bucket; PAYLOAD_SECRET: string
  WORKER_GROUP: string; SITE_ROUTES: string
  [name: `SITE_D1_${string}`]: D1Database
}

/** The deployment manifest owns physical binding IDs. Registry responses must
 * match it; neither an HTTP header nor an RPC result can select arbitrary D1. */
export function requireSiteEnvironment(value: unknown): { env: SiteEnvironment; routes: readonly SiteBinding[] } {
  const env = value as SiteEnvironment
  if (!env || typeof env.PAYLOAD_SECRET !== 'string' || env.PAYLOAD_SECRET.length < 32 ||
    !/^[a-z0-9-]{1,64}$/.test(env.WORKER_GROUP ?? '') ||
    typeof env.IDENTITY?.authenticate !== 'function' || typeof env.IDENTITY?.redeem !== 'function' || typeof env.IDENTITY?.logout !== 'function' ||
    typeof env.ROUTING?.resolve !== 'function' || typeof env.DATA?.readMaster !== 'function' ||
    typeof env.DATA?.readConfig !== 'function' || typeof env.DATA?.readAsset !== 'function' ||
    typeof env.SITE_PUBLIC?.get !== 'function' || typeof env.SITE_PUBLIC?.put !== 'function' ||
    typeof env.SITE_PRIVATE?.get !== 'function' || typeof env.SITE_PRIVATE?.put !== 'function' || env.SITE_PUBLIC === env.SITE_PRIVATE ||
    typeof env.SITE_ROUTES !== 'string') throw new Error('Site role bindings unavailable')
  const routes: SiteBinding[] = JSON.parse(env.SITE_ROUTES)
  if (!Array.isArray(routes) || routes.length < 1 || routes.length > 50) throw new Error('Invalid site group manifest')
  const sites = new Set(), databases = new Set(), bindings = new Set()
  for (const route of routes) {
    assertSiteId(route.siteId)
    if (!Number.isSafeInteger(route.localSiteId) || route.localSiteId < 1 || !Number.isSafeInteger(route.schemaVersion) || route.schemaVersion < 1 ||
      !/^SITE_D1_[A-Z0-9_]+$/.test(route.bindingName) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(route.databaseId) ||
      typeof env[route.bindingName as `SITE_D1_${string}`]?.prepare !== 'function' ||
      sites.has(route.siteId) || databases.has(route.databaseId) || bindings.has(route.bindingName)) throw new Error('Invalid site binding manifest')
    sites.add(route.siteId); databases.add(route.databaseId); bindings.add(route.bindingName)
    Object.freeze(route)
  }
  return { env, routes: Object.freeze(routes) }
}
