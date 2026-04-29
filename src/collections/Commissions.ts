import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { userMayWriteCommissions } from '@/utilities/financeRoleAccess'
import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'
import { denyPortalAndFinanceCollection } from '@/utilities/userAccessTiers'

const loggedInRead = superAdminOrTenantGMPasses(({ req: { user } }) => Boolean(user))

export const Commissions: CollectionConfig = {
  slug: 'commissions',
  labels: { singular: '佣金记录', plural: '佣金记录' },
  admin: {
    group: adminGroups.finance,
    useAsTitle: 'id',
    defaultColumns: ['amount', 'currency', 'status', 'recipient', 'offer', 'updatedAt'],
  },
  access: {
    read: denyPortalAndFinanceCollection('commissions', loggedInRead),
    create: denyPortalAndFinanceCollection(
      'commissions',
      superAdminOrTenantGMPasses(({ req: { user } }) => userMayWriteCommissions(user)),
    ),
    update: denyPortalAndFinanceCollection(
      'commissions',
      superAdminOrTenantGMPasses(({ req: { user } }) => userMayWriteCommissions(user)),
    ),
    delete: denyPortalAndFinanceCollection(
      'commissions',
      superAdminOrTenantGMPasses(({ req: { user } }) => userMayWriteCommissions(user)),
    ),
  },
  fields: [
    {
      name: 'amount',
      type: 'number',
      required: true,
      admin: { step: 0.01 },
    },
    {
      name: 'currency',
      type: 'text',
      required: true,
      defaultValue: 'USD',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Paid', value: 'paid' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: 'Commission attributed to this system user (payout / team mapping).',
      },
    },
    {
      name: 'offer',
      type: 'relationship',
      relationTo: 'offers',
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
    },
    {
      name: 'periodStart',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'periodEnd',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'paidAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
