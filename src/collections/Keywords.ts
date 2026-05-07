import type { CollectionConfig } from 'payload'

import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'
import { adminGroups } from '@/constants/adminGroups'

export const Keywords: CollectionConfig = {
  slug: 'keywords',
  labels: { singular: '关键词', plural: '关键词' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'term',
    defaultColumns: [
      'term',
      'site',
      'status',
      'dataForSeoSeeds',
      'eligible',
      'opportunityScore',
      'volume',
      'updatedAt',
    ],
    listSearchableFields: ['term', 'slug'],
    components: {
      beforeListTable: [
        './components/ArticleFindReplacePanel#FindReplacePanel',
        './components/ArticleCsvImportExport#CsvImportExportPanel',
      ],
      listMenuItems: [
        './components/ArticleFindReplacePanel#FindReplaceListMenuItem',
        './components/ArticleCsvImportExport#CsvImportExportListMenuItem',
      ],
      views: {
        list: {
          actions: [
            './components/CollectionQuickActions#KeywordListQuickAction',
            './components/CollectionQuickActions#KeywordSyncFetchListAction',
          ],
        },
      },
    },
  },
  access: siteScopedCollectionAccess('keywords'),
  hooks: {
    beforeChange: [validateSiteFieldWithinVisibilityScope],
  },
  fields: [
    {
      name: 'term',
      type: 'text',
      required: true,
      label: 'Keyword',
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: {
        description: 'Optional: scope this keyword to one site.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
    },
    {
      name: 'dataForSeoSeeds',
      type: 'json',
      label: 'DFS 种子词',
      admin: {
        description:
          'DataForSEO Labs 拉取时使用的种子词（可多个）；同词被不同种子碰到时会合并。手工建词可留空。',
      },
    },
    { name: 'volume', type: 'number', admin: { description: 'Monthly search volume' } },
    { name: 'keywordDifficulty', type: 'number', label: 'KD' },
    { name: 'cpc', type: 'number' },
    { name: 'trend', type: 'json' },
    {
      name: 'intent',
      type: 'select',
      options: [
        { label: 'Informational', value: 'informational' },
        { label: 'Navigational', value: 'navigational' },
        { label: 'Commercial', value: 'commercial' },
        { label: 'Transactional', value: 'transactional' },
      ],
    },
    { name: 'geoFriendly', type: 'checkbox', defaultValue: false },
    {
      name: 'pillar',
      type: 'relationship',
      relationTo: 'keywords',
      admin: { description: 'Cluster keyword: points to pillar keyword' },
    },
    { name: 'serpFeatures', type: 'json' },
    { name: 'lastRefreshedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'opportunityScore', type: 'number' },
    {
      name: 'eligible',
      type: 'checkbox',
      defaultValue: false,
      label: 'Eligible (AMZ money)',
      admin: {
        description: 'Set by DFS sync when term matches PipelineSettings thresholds (intent / volume / KD / score).',
      },
    },
    {
      name: 'eligibilityReason',
      type: 'textarea',
      admin: {
        description: 'Why eligible or not (for debugging / audits).',
      },
    },
  ],
}
