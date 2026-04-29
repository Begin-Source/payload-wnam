import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getAdminBrandingPublic } from '@/utilities/getAdminBrandingPublic'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({
    config: configPromise,
  })
  const origin = new URL(request.url).origin
  const body = await getAdminBrandingPublic(payload, { requestOrigin: origin })

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
