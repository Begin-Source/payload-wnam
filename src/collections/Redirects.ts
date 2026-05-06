import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: { singular: '重定向', plural: '重定向' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'fromPath',
    defaultColumns: ['fromPath', 'toPath', 'statusCode', 'site', 'enabled', 'sortOrder'],
  },
  access: siteScopedCollectionAccess('redirects'),
  hooks: {
    beforeChange: [validateSiteFieldWithinVisibilityScope],
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: {
        description: 'Optional. Leave empty for a host-wide rule; set to scope to one site.',
      },
    },
    {
      name: 'fromPath',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Full pathname including locale, e.g. /zh/old-slug or /en/legacy',
      },
    },
    {
      name: 'toPath',
      type: 'text',
      required: true,
      admin: {
        description: 'Target path (relative, e.g. /zh/new) or absolute URL.',
      },
    },
    {
      name: 'statusCode',
      type: 'select',
      required: true,
      defaultValue: '301',
      options: [
        { label: '301 Permanent', value: '301' },
        { label: '302 Temporary', value: '302' },
      ],
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Lower runs first when multiple rules match (should be unique per fromPath).' },
    },
  ],
}
