import { WorkerEntrypoint } from 'cloudflare:workers'
import { assertAdminHost, readSiteRegistration, type SiteRegistration } from './registry'

export type SiteRoute = Pick<SiteRegistration, 'siteId' | 'localSiteId' | 'databaseId' | 'bindingName' | 'workerGroup' | 'adminHost' | 'schemaVersion' | 'routingVersion' | 'migrationState'>
export interface SiteRoutingRPC {
  resolve(siteId: string, adminHost: string, workerGroup: string): Promise<SiteRoute | null>
}

/** Internal metadata capability; never exposes SQL or account credentials. */
export class SiteRoutingService extends WorkerEntrypoint<{ CENTRAL_D1: D1Database }> implements SiteRoutingRPC {
  fetch(): Response { return new Response('Not found', { status: 404 }) }
  async resolve(siteId: string, adminHost: string, workerGroup: string): Promise<SiteRoute | null> {
    assertAdminHost(siteId, adminHost)
    const row = await readSiteRegistration(this.env.CENTRAL_D1, siteId)
    if (!row || row.adminHost !== adminHost || row.workerGroup !== workerGroup) return null
    return { siteId: row.siteId, localSiteId: row.localSiteId, databaseId: row.databaseId, bindingName: row.bindingName,
      workerGroup: row.workerGroup, adminHost: row.adminHost, schemaVersion: row.schemaVersion,
      routingVersion: row.routingVersion, migrationState: row.migrationState }
  }
}
