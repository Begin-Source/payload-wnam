import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Redirect } from '@/payload-types'
import { getRequestHost } from '@/utilities/normalizeRequestHost'
import { resolveSiteForLanding } from '@/utilities/resolveSiteForLanding'

/**
 * Resolve CMS redirect for a pathname. Site-specific rows win over global (no `site`).
 */
export async function findRedirectForPath(pathname: string, requestHeaders: Headers): Promise<Redirect | null> {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const rawHost = getRequestHost(requestHeaders) ?? ''
  const siteSlug = requestHeaders.get('x-site-slug')?.trim() ?? ''
  const site = await resolveSiteForLanding(payload, { rawHost, siteSlugFromHeader: siteSlug })
  const siteId = site?.id ?? null

  const baseAnd = [
    { enabled: { equals: true } },
    { fromPath: { equals: pathname } },
  ] as const

  const tryFind = async (where: Record<string, unknown>): Promise<Redirect | null> => {
    const res = await payload.find({
      collection: 'redirects',
      where: { and: [...baseAnd, where] },
      sort: 'sortOrder',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return (res.docs[0] as Redirect | undefined) ?? null
  }

  if (siteId != null) {
    const scoped = await tryFind({ site: { equals: siteId } })
    if (scoped) return scoped
  }

  return tryFind({ site: { equals: null } })
}
