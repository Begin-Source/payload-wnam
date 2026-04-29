import type { Access } from 'payload'

import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'
import { denyPortalAndFinanceCollection } from '@/utilities/userAccessTiers'

const loggedIn: Access = ({ req: { user } }) => Boolean(user)

/** `superAdminOrTenantGMPasses(loggedIn)` with finance + 仅公告 portal 白名单。 */
export function loggedInSuperAdminAccessFor(collectionSlug: string) {
  return {
    read: denyPortalAndFinanceCollection(collectionSlug, superAdminOrTenantGMPasses(loggedIn)),
    create: denyPortalAndFinanceCollection(collectionSlug, superAdminOrTenantGMPasses(loggedIn)),
    update: denyPortalAndFinanceCollection(collectionSlug, superAdminOrTenantGMPasses(loggedIn)),
    delete: denyPortalAndFinanceCollection(collectionSlug, superAdminOrTenantGMPasses(loggedIn)),
  }
}
