import type { Access } from 'payload'

import { buildSitesVisibilityWhere } from '@/utilities/siteVisibilityScope'
import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'

const loggedIn: Access = ({ req: { user } }) => Boolean(user)

const sitesReadAccess: Access = async (args) => {
  return buildSitesVisibilityWhere(args.req)
}

const sitesMutateAccess: Access = async (args) => {
  return buildSitesVisibilityWhere(args.req)
}

/** Sites collection: portal/finance wrapping stays on callers via denyPortalAndFinanceCollection where needed. */
export const sitesCollectionAccess = {
  /** Narrow rows for site-manager / team-lead; MCP-like principals stay tenant-wide at collection layer. */
  read: sitesReadAccess,
  create: superAdminOrTenantGMPasses(loggedIn),
  update: sitesMutateAccess,
  delete: sitesMutateAccess,
}
