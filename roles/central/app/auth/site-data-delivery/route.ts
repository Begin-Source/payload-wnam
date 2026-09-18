import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCentralDataDeliveryEnvironment } from '@/application-roles/centralEnvironment'
import { centralIdentityFromPayload } from '@/site-control/centralSiteEntry'
import { centralDataDelivery } from '@/site-control/dataDeliveryHttp'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  const env = requireCentralDataDeliveryEnvironment((await getCloudflareContext({ async: true })).env)
  return centralDataDelivery(request,{ centralOrigin: env.CENTRAL_ORIGIN,database: env.CENTRAL_D1,archive: env.MASTER_ASSET_ARCHIVE,
    queue: env.DATA_DELIVERY_QUEUE,secret: env.DATA_DELIVERY_CAPABILITY_SECRET,
    authenticate: async request => centralIdentityFromPayload(await getPayload({ config }),request) })
}

export const GET = handle
export const POST = handle
