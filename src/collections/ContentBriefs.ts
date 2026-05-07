import type { CollectionConfig } from 'payload'

import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'
import { contentBriefOutlineValidate } from '@/collections/hooks/contentBriefOutlineValidate'
import { adminGroups } from '@/constants/adminGroups'

export const ContentBriefs: CollectionConfig = {
  slug: 'content-briefs',
  labels: { singular: '内容大纲', plural: '内容大纲' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'title',
    defaultColumns: ['title', 'site', 'status', 'updatedAt'],
    components: {
      views: {
        list: {
          actions: ['./components/CollectionQuickActions#ArticleListQuickAction'],
        },
      },
    },
  },
  access: siteScopedCollectionAccess('content-briefs'),
  hooks: {
    beforeValidate: [contentBriefOutlineValidate],
    beforeChange: [validateSiteFieldWithinVisibilityScope],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'primaryKeyword',
      type: 'relationship',
      relationTo: 'keywords',
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
    },
    {
      name: 'intentSummary',
      type: 'textarea',
    },
    {
      name: 'outline',
      type: 'json',
      required: true,
      admin: {
        description: 'Structured sections[] + globalContext (H2/H3, wordBudget, inject)',
      },
    },
    { name: 'sources', type: 'json' },
    { name: 'targetWordCount', type: 'number', defaultValue: 2000 },
    { name: 'competitors', type: 'json' },
    { name: 'peopleAlsoAsk', type: 'json' },
    { name: 'schemaHints', type: 'json' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Approved', value: 'approved' },
        { label: 'Used', value: 'used' },
      ],
    },
    { name: 'skillId', type: 'text' },
  ],
}
