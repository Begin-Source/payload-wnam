import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCentralEnvironment } from '@/application-roles/centralEnvironment'
import { centralIdentityFromPayload, centralSiteEntry } from '@/site-control/centralSiteEntry'
import { payloadSessionAuthority } from '@/site-control/payloadSessionAuthority'
import { SiteLoginBroker } from '@/site-control/sso'

export const dynamic = 'force-dynamic'
export async function POST(request: Request): Promise<Response> {
  const env = requireCentralEnvironment((await getCloudflareContext({ async: true })).env)
  return centralSiteEntry(request,{
    centralOrigin: env.CENTRAL_ORIGIN,
    broker: new SiteLoginBroker(env.CENTRAL_D1,payloadSessionAuthority(env.CENTRAL_D1)),
    authenticate: async request => centralIdentityFromPayload(await getPayload({ config }),request),
  })
}
