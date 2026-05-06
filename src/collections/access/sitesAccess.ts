import type { Access, PayloadRequest, Where } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'
import { userIdFromRelation } from '@/utilities/teamsUserScope'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

const loggedIn: Access = ({ req: { user } }) => Boolean(user)

async function teamLeadRelatedCreatorIds(
  payload: PayloadRequest['payload'],
  req: PayloadRequest,
  leadUserId: number,
): Promise<number[]> {
  const teams = await payload.find({
    collection: 'teams',
    where: { lead: { equals: leadUserId } },
    limit: 100,
    depth: 0,
    req,
    overrideAccess: true,
  })

  const ids = new Set<number>()
  ids.add(leadUserId)

  for (const doc of teams.docs) {
    const members = (doc as { members?: unknown }).members
    if (!Array.isArray(members)) continue
    for (const m of members) {
      const id = userIdFromRelation(m)
      if (id != null) ids.add(id)
    }
  }

  return [...ids]
}

/**
 * Site-manager: own created docs. Team-lead: own + sites created by team members (plus self for lead-created rows).
 * GM / ops: tenant-wide (handled before this). Legacy rows with null createdBy only match GM/ops path (never this Where).
 */
async function restrictedSitesWhere(req: PayloadRequest): Promise<Where | false> {
  const user = req.user
  if (!user) return false

  if (!isUsersCollection(user)) {
    return true
  }

  if (userHasUnscopedAdminAccess(user)) return true
  if (userHasTenantGeneralManagerRole(user) || userHasRole(user, 'ops-manager')) return true

  const clauses: Where[] = []

  if (userHasRole(user, 'site-manager')) {
    clauses.push({ createdBy: { equals: user.id } })
  }

  if (userHasRole(user, 'team-lead')) {
    const creatorIds = await teamLeadRelatedCreatorIds(req.payload, req, user.id)
    if (creatorIds.length > 0) {
      clauses.push({ createdBy: { in: creatorIds } })
    }
  }

  if (clauses.length === 0) return false
  if (clauses.length === 1) return clauses[0] as Where
  return { or: clauses }
}

const sitesReadAccess: Access = async (args) => {
  const w = await restrictedSitesWhere(args.req)
  if (w === true || w === false) return w
  return w
}

const sitesMutateAccess: Access = async (args) => {
  return restrictedSitesWhere(args.req)
}

/** Sites collection: portal/finance wrapping stays on callers via denyPortalAndFinanceCollection where needed. */
export const sitesCollectionAccess = {
  /** Narrow rows for site-manager / team-lead; MCP-like principals stay tenant-wide at collection layer. */
  read: sitesReadAccess,
  create: superAdminOrTenantGMPasses(loggedIn),
  update: sitesMutateAccess,
  delete: sitesMutateAccess,
}
