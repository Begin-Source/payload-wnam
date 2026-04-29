import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

export const AffiliateNetworks: CollectionConfig = {
  slug: 'affiliate-networks',
  labels: { singular: '联盟', plural: '联盟' },
  admin: {
    group: adminGroups.business,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'status', 'updatedAt'],
    description:
      '联盟（Affiliate networks）可被 Offer.network 必选引用 — 录入 Offer 前请至少在此处创建一条。',
  },
  access: loggedInSuperAdminAccessFor('affiliate-networks'),
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
      index: true,
    },
    {
      name: 'websiteUrl',
      type: 'text',
      label: 'Program URL',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
