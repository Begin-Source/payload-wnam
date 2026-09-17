import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCentralEnvironment } from '@/application-roles/centralEnvironment'
import { centralIdentityFromPayload } from '@/site-control/centralSiteEntry'
import { centralManagementMcp } from '@/site-control/managementMcp'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  const env = requireCentralEnvironment((await getCloudflareContext({ async: true })).env)
  return centralManagementMcp(request,{ centralOrigin: env.CENTRAL_ORIGIN,database: env.CENTRAL_D1,
    authenticate: async request => centralIdentityFromPayload(await getPayload({ config }),request) })
}
export { handle as POST, handle as GET, handle as DELETE, handle as OPTIONS }
