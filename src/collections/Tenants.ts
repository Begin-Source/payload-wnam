import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { financeOnlyBlocksCollection } from '@/utilities/financeRoleAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { superAdminPasses } from '@/utilities/superAdminPasses'
import { getTenantIdsForUser } from '@/utilities/tenantScope'
import { announcementsPortalBlocksCollection } from '@/utilities/userAccessTiers'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: { singular: '租户', plural: '租户' },
  admin: {
    group: adminGroups.system,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'domain'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (announcementsPortalBlocksCollection(user, 'tenants')) return false
      if (financeOnlyBlocksCollection(user, 'tenants')) return false
      if (userHasUnscopedAdminAccess(user)) return true
      if (!isUsersCollection(user)) return false
      const ids = getTenantIdsForUser(user)
      if (ids.length === 0) return false
      return { id: { in: ids } }
    },
    create: superAdminPasses(() => false),
    update: superAdminPasses(() => false),
    delete: superAdminPasses(() => false),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'domain',
      type: 'text',
      required: true,
    },
  ],
}
