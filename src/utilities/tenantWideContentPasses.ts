import type { Access } from 'payload'

import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

/** Super-admin / GM / ops-manager: full tenant-wide content access before site-manager narrowing. */
export function tenantWideContentPasses(otherwise: Access): Access {
  return (args) => {
    const u = args.req.user
    if (userHasUnscopedAdminAccess(u)) return true
    if (userHasTenantGeneralManagerRole(u)) return true
    if (userHasRole(u, 'ops-manager')) return true
    return otherwise(args)
  }
}
