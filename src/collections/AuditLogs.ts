import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: '审计日志', plural: '审计日志' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'id',
    defaultColumns: ['action', 'collectionSlug', 'actor', 'occurredAt'],
  },
  access: loggedInSuperAdminAccessFor('audit-logs'),
  fields: [
    {
      name: 'action',
      type: 'text',
      required: true,
      label: 'Action',
    },
    {
      name: 'collectionSlug',
      type: 'text',
      label: 'Collection slug',
    },
    {
      name: 'documentId',
      type: 'text',
      label: 'Document id',
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'occurredAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
