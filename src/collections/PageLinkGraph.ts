import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

export const PageLinkGraph: CollectionConfig = {
  slug: 'page-link-graph',
  labels: { singular: '内链边', plural: '内链图' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'anchorText',
    defaultColumns: ['site', 'fromCollection', 'toCollection', 'location', 'lastSeenAt'],
  },
  access: loggedInSuperAdminAccessFor('page-link-graph'),
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites' },
    { name: 'fromCollection', type: 'text', required: true, index: true },
    { name: 'fromId', type: 'text', required: true, index: true },
    { name: 'toCollection', type: 'text', required: true, index: true },
    { name: 'toId', type: 'text', required: true, index: true },
    { name: 'toExternal', type: 'text' },
    { name: 'anchorText', type: 'text' },
    {
      name: 'anchorType',
      type: 'select',
      options: [
        { label: 'Exact', value: 'exact' },
        { label: 'Partial', value: 'partial' },
        { label: 'Brand', value: 'brand' },
        { label: 'Generic', value: 'generic' },
        { label: 'Naked URL', value: 'naked_url' },
        { label: 'Image', value: 'image' },
      ],
    },
    {
      name: 'location',
      type: 'select',
      defaultValue: 'body',
      options: [
        { label: 'Body', value: 'body' },
        { label: 'Main nav', value: 'main_nav' },
        { label: 'Footer', value: 'footer' },
        { label: 'Sidebar', value: 'sidebar' },
        { label: 'Related', value: 'related_block' },
        { label: 'Breadcrumb', value: 'breadcrumb' },
        { label: 'Author bio', value: 'author_bio' },
      ],
    },
    { name: 'contextSnippet', type: 'textarea' },
    { name: 'rel', type: 'text' },
    { name: 'createdBy', type: 'text' },
    { name: 'lastSeenAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
