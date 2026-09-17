import { WorkerEntrypoint } from 'cloudflare:workers'
import type { SiteEnvironment } from '../application-roles/siteEnvironment'
import { inspectProvisionedSite } from './provisionInspection'

/** Named service binding only. The public/default fetch never mounts this. */
export class SiteProvisionInspectionService extends WorkerEntrypoint<SiteEnvironment> {
  fetch(): Response { return new Response('Not found',{ status: 404 }) }
  inspect(siteId: string,operationId: string) { return inspectProvisionedSite(this.env,siteId,operationId) }
}
