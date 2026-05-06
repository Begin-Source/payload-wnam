import type { Payload, PayloadRequest, Where } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { userIdFromRelation } from '@/utilities/teamsUserScope'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

export async function teamLeadRelatedCreatorIds(
  payload: Payload,
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
 * Visibility rules for `sites` rows (and derived site-id lists for content filtering).
 * MCP / non-`users` principals: `true` (tenant plugin only).
 */
export async function buildSitesVisibilityWhere(req: PayloadRequest): Promise<Where | true | false> {
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
    clauses.push({ operators: { contains: user.id } })
  }

  if (userHasRole(user, 'team-lead')) {
    const creatorIds = await teamLeadRelatedCreatorIds(req.payload, req, user.id)
    if (creatorIds.length > 0) {
      clauses.push({ createdBy: { in: creatorIds } })
    }
    clauses.push({ operators: { contains: user.id } })
  }

  if (clauses.length === 0) return false
  if (clauses.length === 1) return clauses[0] as Where
  return { or: clauses }
}

/** Resolve visible numeric site ids for content `site in (...)`. */
export async function resolveVisibleSiteIds(
  payload: Payload,
  req: PayloadRequest,
): Promise<number[] | true | false> {
  const w = await buildSitesVisibilityWhere(req)
  if (w === true) return true
  if (w === false) return false

  const ids: number[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'sites',
      where: w,
      depth: 0,
      limit: 200,
      page,
      pagination: true,
      req,
      overrideAccess: true,
    })
    ids.push(...res.docs.map((d: { id: number }) => d.id))
    if (!res.hasNextPage) break
    page++
  }
  return ids
}
