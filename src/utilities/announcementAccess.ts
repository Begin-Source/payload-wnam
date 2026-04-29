import type { Where } from 'payload'

import type { Config } from '@/payload-types'
import { getTenantIdsForUser } from '@/utilities/tenantScope'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'

export function isUsersCollection(
  user: Config['user'] | null | undefined,
): user is Config['user'] & { collection: 'users' } {
  return Boolean(user && user.collection === 'users')
}

function teamLeadId(user: Config['user'] & { collection: 'users' }): number | null {
  const tl = user.teamLead
  if (tl === null || tl === undefined) return null
  return typeof tl === 'object' ? tl.id : tl
}

/**
 * Non–super-admin read filter: tenant-scoped system announcements + team announcements for own team.
 */
export function announcementsReadWhere(
  user: Config['user'] | null | undefined,
): boolean | Where {
  if (!isUsersCollection(user)) return false
  if (userHasUnscopedAdminAccess(user)) return true

  const tenantIds = getTenantIdsForUser(user)
  if (tenantIds.length === 0) return false

  const uid = user.id
  const memberOfLead = teamLeadId(user)

  return {
    and: [
      { tenant: { in: tenantIds } },
      {
        or: [
          { kind: { equals: 'system' } },
          {
            and: [
              { kind: { equals: 'team' } },
              {
                or: [
                  { teamLead: { equals: uid } },
                  ...(memberOfLead !== null ? [{ teamLead: { equals: memberOfLead } }] : []),
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

export function canTeamLeadManageDoc(
  user: Config['user'] & { collection: 'users' },
  teamLeadOnDoc: number | null | undefined,
): boolean {
  if (userHasUnscopedAdminAccess(user)) return true
  if (teamLeadOnDoc !== user.id) return false
  return true
}
