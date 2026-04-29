import type { FilterOptions, Where } from 'payload'

import type { User } from '@/payload-types'
import { getTenantIdsForUser } from '@/utilities/tenantScope'
import { userHasRole } from '@/utilities/userRoles'

const noUsers: Where = { id: { equals: 0 } }

/** Resolve multi-tenant `tenant` on `teams` (number or populated `{ id }`). */
export function tenantIdFromTeamData(data: Record<string, unknown> | null | undefined): number | null {
  if (!data) return null
  const t = data.tenant
  if (t == null || t === '') return null
  if (typeof t === 'number' && Number.isFinite(t)) return t
  if (typeof t === 'object' && t !== null && 'id' in t) {
    const id = (t as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

function roleAndTenantWhere(role: 'team-lead' | 'site-manager', tenantId: number): Where {
  return {
    and: [
      { roles: { contains: role } },
      { 'tenants.tenant': { equals: tenantId } },
    ],
  }
}

export const teamsLeadFilterOptions: FilterOptions = ({ siblingData }) => {
  const tenantId = tenantIdFromTeamData(siblingData as Record<string, unknown>)
  if (tenantId == null) return noUsers
  return roleAndTenantWhere('team-lead', tenantId)
}

export const teamsMembersFilterOptions: FilterOptions = ({ siblingData }) => {
  const tenantId = tenantIdFromTeamData(siblingData as Record<string, unknown>)
  if (tenantId == null) return noUsers
  return roleAndTenantWhere('site-manager', tenantId)
}

export function userIdFromRelation(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && 'id' in (value as object)) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

export function userBelongsToTenant(user: User, tenantId: number): boolean {
  return getTenantIdsForUser(user as User & { collection: 'users' }).includes(tenantId)
}

export function assertTeamUserRels(
  user: User,
  role: 'team-lead' | 'site-manager',
  tenantId: number,
  label: string,
): void {
  if (!userHasRole(user, role)) {
    throw new Error(
      `「${label}」须为「${role === 'team-lead' ? '组长' : '站长'}」角色（${role}）。`,
    )
  }
  if (!userBelongsToTenant(user, tenantId)) {
    throw new Error(`「${label}」须属于本团队所在租户。`)
  }
}
