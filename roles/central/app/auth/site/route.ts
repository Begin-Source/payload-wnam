import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCentralEnvironment } from '@/application-roles/centralEnvironment'
import { centralIdentityFromPayload } from '@/site-control/centralSiteEntry'
import { centralSiteManagement } from '@/site-control/siteManagementHttp'

export const dynamic = 'force-dynamic'
export async function GET(request: Request): Promise<Response> {
  const env = requireCentralEnvironment((await getCloudflareContext({ async: true })).env)
  return centralSiteManagement(request,{ centralOrigin: env.CENTRAL_ORIGIN,database: env.CENTRAL_D1,
    authenticate: async request => centralIdentityFromPayload(await getPayload({ config }),request) })
}
