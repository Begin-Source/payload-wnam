import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

export const SocialPlatforms: CollectionConfig = {
  slug: 'social-platforms',
  labels: { singular: '社交平台', plural: '社交平台' },
  admin: {
    group: adminGroups.social,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'status', 'updatedAt'],
  },
  access: loggedInSuperAdminAccessFor('social-platforms'),
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
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
    { name: 'notes', type: 'textarea' },
  ],
}
