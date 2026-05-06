import type { Access, CollectionConfig, Where } from 'payload'

import { resolveVisibleSiteIds } from '@/utilities/siteVisibilityScope'
import { tenantWideContentPasses } from '@/utilities/tenantWideContentPasses'
import { denyPortalAndFinanceCollection } from '@/utilities/userAccessTiers'

function impossibleWhere(): Where {
  return { id: { equals: 0 } }
}

export type SiteScopedContentVariant = 'single-site' | 'authors' | 'original-evidence'

/** Site-manager / team-lead narrow by visible sites; GM / ops / super-admin unchanged within tenant. */
export function siteScopedCollectionAccess(
  collectionSlug: string,
  variant: SiteScopedContentVariant = 'single-site',
): CollectionConfig['access'] {
  const scopedWhere: Access = tenantWideContentPasses(async ({ req }) => {
    const ids = await resolveVisibleSiteIds(req.payload, req)
    if (ids === false) return false
    if (ids === true) return Boolean(req.user)
    if (ids.length === 0) return impossibleWhere()
    if (variant === 'authors') {
      return { or: ids.map((id) => ({ sites: { contains: id } })) }
    }
    if (variant === 'original-evidence') {
      return { article: { site: { in: ids } } }
    }
    return { site: { in: ids } }
  })

  const loggedIn: Access = ({ req: { user } }) => Boolean(user)

  return {
    read: denyPortalAndFinanceCollection(collectionSlug, scopedWhere),
    create: denyPortalAndFinanceCollection(collectionSlug, tenantWideContentPasses(loggedIn)),
    update: denyPortalAndFinanceCollection(collectionSlug, scopedWhere),
    delete: denyPortalAndFinanceCollection(collectionSlug, scopedWhere),
  }
}
