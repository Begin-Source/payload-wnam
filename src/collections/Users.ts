import type { Access, CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { tenantsArrayField } from '@payloadcms/plugin-multi-tenant/fields'

import type { Config } from '@/payload-types'
import { adminGroups } from '@/constants/adminGroups'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { financeOnlyBlocksCollection } from '@/utilities/financeRoleAccess'
import { userHasAllTenantAccess, userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { superAdminPasses } from '@/utilities/superAdminPasses'
import { getTenantIdsForUser } from '@/utilities/tenantScope'
import {
  announcementsPortalBlocksCollection,
  userHasFinanceRoleNonSuper,
  userIsPureSiteManagerWithoutTeamOrOps,
} from '@/utilities/userAccessTiers'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'
import { usersReadWhere, usersUpdateWhere } from '@/utilities/usersAccess'

const OPS_CREATABLE_ROLES = new Set(['team-lead', 'site-manager'])

function tenantIdsFromIncomingTenants(data: Record<string, unknown>): number[] {
  const rows = data.tenants
  if (!Array.isArray(rows)) return []
  const ids: number[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const t = (row as { tenant?: unknown }).tenant
    const id =
      typeof t === 'object' && t !== null && 'id' in t
        ? Number((t as { id: unknown }).id)
        : typeof t === 'number'
          ? t
          : null
    if (typeof id === 'number' && Number.isFinite(id)) ids.push(id)
  }
  return ids
}

function normalizeRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return []
  return roles.map((r) => String(r))
}

function tenantIdsForUserPayload(
  next: Record<string, unknown>,
  originalDoc: unknown,
  operation: string,
): number[] {
  if (Object.prototype.hasOwnProperty.call(next, 'tenants')) {
    return tenantIdsFromIncomingTenants(next)
  }
  if (operation === 'update' && originalDoc && typeof originalDoc === 'object') {
    return tenantIdsFromIncomingTenants(originalDoc as Record<string, unknown>)
  }
  return []
}

const enforceUserTenantAndRoles: CollectionBeforeChangeHook = ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  let next = { ...data }
  const roles = next.roles
  if (Array.isArray(roles) && roles.includes('super-admin') && !userHasAllTenantAccess(req.user)) {
    const withoutSuperAdmin = roles.filter((r: string) => r !== 'super-admin')
    next = { ...next, roles: withoutSuperAdmin.length > 0 ? withoutSuperAdmin : ['user'] }
  }
  const rolesAfter = next.roles
  if (Array.isArray(rolesAfter) && rolesAfter.includes('system-admin') && !userHasUnscopedAdminAccess(req.user)) {
    const without = rolesAfter.filter((r: string) => r !== 'system-admin')
    next = { ...next, roles: without.length > 0 ? without : ['user'] }
  }

  const finalRoles = normalizeRoles(next.roles)
  if (finalRoles.includes('general-manager')) {
    const tids = tenantIdsForUserPayload(
      next as Record<string, unknown>,
      originalDoc,
      operation,
    )
    if (tids.length === 0) {
      throw new Error('总经理须分配至少一个所属租户')
    }
  }

  if (!isUsersCollection(req.user)) return next

  if (operation === 'update' && originalDoc && Array.isArray((originalDoc as { roles?: unknown }).roles)) {
    const origRoles = (originalDoc as { roles: string[] }).roles
    if (origRoles.includes('super-admin') && !userHasAllTenantAccess(req.user)) {
      throw new Error('不能修改超级管理员账户')
    }
    if (origRoles.includes('system-admin') && !userHasUnscopedAdminAccess(req.user)) {
      throw new Error('不能修改系统管理员账户')
    }
  }

  const actor = req.user
  if (!userHasAllTenantAccess(actor) && isUsersCollection(actor)) {
    const nextRoles = normalizeRoles(next.roles)
    if (
      !userHasTenantGeneralManagerRole(actor) &&
      !userHasRole(actor, 'system-admin') &&
      userHasRole(actor, 'ops-manager')
    ) {
      for (const r of nextRoles) {
        if (!OPS_CREATABLE_ROLES.has(r)) {
          throw new Error('运营经理仅可将用户角色设为组长或站长')
        }
      }
      if (nextRoles.length === 0) {
        throw new Error('请至少为账户指定组长或站长角色')
      }
    } else if (
      !userHasTenantGeneralManagerRole(actor) &&
      !userHasRole(actor, 'system-admin') &&
      userHasRole(actor, 'team-lead') &&
      !userHasRole(actor, 'ops-manager')
    ) {
      const unique = [...new Set(nextRoles)].sort()
      if (unique.length !== 1 || unique[0] !== 'site-manager') {
        throw new Error('组长仅可创建或维护「站长」角色用户')
      }
    }
  }

  if (
    (userHasRole(req.user, 'ops-manager') || userHasTenantGeneralManagerRole(req.user)) &&
    !userHasAllTenantAccess(req.user)
  ) {
    const allowed = new Set(getTenantIdsForUser(req.user))
    const incoming = tenantIdsFromIncomingTenants(next as Record<string, unknown>)
    if (incoming.length === 0 && operation === 'create') {
      throw new Error('新建用户必须分配至少一个所属租户')
    }
    for (const tid of incoming) {
      if (!allowed.has(tid)) {
        throw new Error('只能将用户分配到您已拥有的租户')
      }
    }
  }

  if (
    userHasRole(req.user, 'team-lead') &&
    !userHasRole(req.user, 'ops-manager') &&
    !userHasAllTenantAccess(req.user)
  ) {
    const allowed = new Set(getTenantIdsForUser(req.user))
    const incoming = tenantIdsFromIncomingTenants(next as Record<string, unknown>)
    if (incoming.length === 0 && operation === 'create') {
      throw new Error('新建用户必须分配至少一个所属租户')
    }
    for (const tid of incoming) {
      if (!allowed.has(tid)) {
        throw new Error('只能将用户分配到您已拥有的租户')
      }
    }
  }

  return next
}

const usersReadAccess: Access = (args) => {
  const { user } = args.req
  if (announcementsPortalBlocksCollection(user, 'users')) return false
  if (financeOnlyBlocksCollection(user, 'users')) return false
  if (userIsPureSiteManagerWithoutTeamOrOps(user)) return false
  return superAdminPasses(({ req: { user: u } }) => usersReadWhere(u))(args)
}

const usersUpdateAccess: Access = (args) => {
  const { user } = args.req
  if (announcementsPortalBlocksCollection(user, 'users')) return false
  if (financeOnlyBlocksCollection(user, 'users')) return false
  if (userIsPureSiteManagerWithoutTeamOrOps(user)) return false
  return superAdminPasses(({ req: { user: u } }) => usersUpdateWhere(u))(args)
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: '用户', plural: '用户' },
  admin: {
    group: adminGroups.system,
    useAsTitle: 'email',
    hidden: ({ user }) =>
      Boolean(user && userIsPureSiteManagerWithoutTeamOrOps(user as Config['user'])),
  },
  auth: true,
  access: {
    admin: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => {
      if (userHasFinanceRoleNonSuper(user)) return false
      if (announcementsPortalBlocksCollection(user, 'users')) return false
      if (userIsPureSiteManagerWithoutTeamOrOps(user)) return false
      if (financeOnlyBlocksCollection(user, 'users')) return false
      if (userHasUnscopedAdminAccess(user)) return true
      if (!user) return true
      if (isUsersCollection(user) && userHasRole(user, 'ops-manager')) return true
      if (isUsersCollection(user) && userHasTenantGeneralManagerRole(user)) return true
      if (isUsersCollection(user) && userHasRole(user, 'team-lead') && !userHasRole(user, 'ops-manager')) {
        return true
      }
      return false
    },
    read: usersReadAccess,
    update: usersUpdateAccess,
    delete: superAdminPasses(() => false),
    unlock: superAdminPasses(() => false),
  },
  hooks: {
    beforeChange: [enforceUserTenantAndRoles],
  },
  fields: [
    tenantsArrayField({ tenantsCollectionSlug: 'tenants' }),
    {
      name: 'teamLead',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description:
          'Optional team lead for commission / reporting (same tenant; refine access in PRD as needed).',
      },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      required: true,
      options: [
        { label: 'User', value: 'user' },
        { label: '站长', value: 'site-manager' },
        { label: '组长', value: 'team-lead' },
        { label: '运营经理', value: 'ops-manager' },
        { label: '财务经理', value: 'finance' },
        { label: '总经理', value: 'general-manager' },
        { label: '系统管理员', value: 'system-admin' },
        { label: 'Super Admin', value: 'super-admin' },
      ],
      access: {
        update: ({ req: { user } }) =>
          userHasUnscopedAdminAccess(user) ||
          (isUsersCollection(user) &&
            (userHasRole(user, 'ops-manager') ||
              userHasTenantGeneralManagerRole(user) ||
              (userHasRole(user, 'team-lead') && !userHasRole(user, 'ops-manager')))),
      },
      admin: {
        description:
          'Super Admin：全租户。仅 Super Admin 可修改本字段。其它角色（财务 / 运营 / 组长 / 站长）的具体权限在代码与各集合 access 中逐步收紧。',
      },
    },
  ],
}
