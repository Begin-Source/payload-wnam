import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

type SiteBrief = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  mainProduct?: string | null
}

type BlueprintOption = {
  id: number
  name: string
  slug: string
  mirroredSiteLayout: string | null
  site: SiteBrief | null
}

/**
 * GET ?q= — search site-blueprints (tenant-scoped), depth 1 for linked site.
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = getTenantScopeForStats(user)
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const searchWhere =
    q.length > 0
      ? {
          or: [{ name: { contains: q } }, { slug: { contains: q } }],
        }
      : undefined

  const where = combineTenantWhere(scope, searchWhere)

  const result = await payload.find({
    collection: 'site-blueprints',
    limit: 50,
    sort: '-updatedAt',
    depth: 1,
    ...(where ? { where } : {}),
  })

  const blueprints: BlueprintOption[] = result.docs.map((doc) => {
    const row = doc as typeof doc & {
      mirroredSiteLayout?: string | null
      site?: number | SiteBrief | null
    }
    let site: SiteBrief | null = null
    const s = row.site
    if (s && typeof s === 'object' && 'id' in s) {
      site = {
        id: s.id,
        name: s.name,
        slug: String(s.slug ?? ''),
        primaryDomain: String(s.primaryDomain ?? ''),
        mainProduct: (s as { mainProduct?: string | null }).mainProduct ?? null,
      }
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      mirroredSiteLayout: row.mirroredSiteLayout ?? null,
      site,
    }
  })

  return Response.json({ blueprints })
}
