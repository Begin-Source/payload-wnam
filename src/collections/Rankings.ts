import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'
import { RankingSource } from '@/utilities/seoMatrixPipeline'

export const Rankings: CollectionConfig = {
  slug: 'rankings',
  labels: { singular: '排名快照', plural: '排名快照' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'searchQuery',
    defaultColumns: [
      'searchQuery',
      'rankingSource',
      'keyword',
      'site',
      'serpPosition',
      'capturedAt',
      'updatedAt',
    ],
    listSearchableFields: ['searchQuery', 'serpUrl', 'notes'],
  },
  access: siteScopedCollectionAccess('rankings'),
  hooks: {
    beforeChange: [validateSiteFieldWithinVisibilityScope],
  },
  fields: [
    {
      name: 'rankingSource',
      type: 'select',
      label: '来源',
      defaultValue: RankingSource.serpLive,
      options: [
        { label: '实时 SERP 位次 (rank-track)', value: RankingSource.serpLive },
        { label: '自有域名出词 (Labs ranked_keywords)', value: RankingSource.domainRankedKeywords },
      ],
      admin: {
        description:
          'domain_ranked_keywords 为 DataForSEO Labs 域名出词导入；文章生命周期 triage 仅使用 serp_live。',
      },
    },
    {
      name: 'keyword',
      type: 'relationship',
      relationTo: 'keywords',
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
    },
    {
      name: 'searchQuery',
      type: 'text',
      required: true,
      label: 'Query string',
    },
    {
      name: 'serpPosition',
      type: 'number',
      admin: { step: 1 },
      label: 'SERP position',
    },
    {
      name: 'serpUrl',
      type: 'text',
      label: 'SERP / screenshot URL',
    },
    {
      name: 'capturedAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'notes', type: 'textarea' },
    { name: 'rawSerp', type: 'json' },
    { name: 'change', type: 'number' },
    { name: 'isAiOverviewHit', type: 'checkbox', defaultValue: false },
  ],
}
