import type { CollectionConfig } from 'payload'

import { postLikeFields } from '@/collections/shared/postLikeFields'
import { adminGroups } from '@/constants/adminGroups'
import { isTrustBundleEnPage } from '@/utilities/sitePagesBundleContent/trustPageConstants'
import { validateSlugLocaleUnique } from '@/collections/shared/validateSlugLocaleUnique'
import { validateCategoriesMatchSite } from '@/collections/shared/validateCategoriesMatchSite'
import { pageLinkGraphSync } from '@/collections/hooks/pageLinkGraphSync'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

const sitePagesBundleFields = ((): CollectionConfig['fields'] => {
  const condition = (_data: unknown, sibling: unknown): boolean =>
    isTrustBundleEnPage(sibling as { slug?: string; locale?: string } | null | undefined)
  return [
    {
      name: 'sitePagesBundleWorkflowStatus',
      type: 'text',
      label: '信任页包流程',
      defaultValue: 'idle',
      admin: {
        condition,
        description:
          'n8n 同源：About/Contact/Privacy/Terms/Affiliate 五张 en 页一次生成。仅上列 slug 且 locale 为 en 时显示与更新。',
        listView: { label: '信任页包' },
        components: {
          Cell: './components/SitePagesBundleWorkflowStatusCell#SitePagesBundleWorkflowStatusCell',
        },
      },
    },
    {
      name: 'sitePagesBundleWorkflowLog',
      type: 'textarea',
      label: '信任页包日志',
      admin: {
        condition,
        readOnly: true,
        rows: 10,
        description: '失败时由「生成信任页包」追加；成功不整段清空。',
      },
    },
    {
      name: 'sitePagesBundleLastErrorCode',
      type: 'text',
      label: '末次错误代码',
      admin: { condition, hidden: true, readOnly: true },
    },
    {
      name: 'sitePagesBundleLastErrorDetail',
      type: 'textarea',
      label: '末次错误详情',
      admin: { condition, hidden: true, readOnly: true },
    },
    {
      name: 'sitePagesBundleLastErrorAt',
      type: 'text',
      label: '末次错误时间',
      admin: {
        condition,
        hidden: true,
        readOnly: true,
        description: 'ISO 8601（UTC）文本。使用 text 避免空串在列表查询时被当作非法 Date。',
      },
    },
  ]
})()

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: '页面', plural: '页面' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'title',
    defaultColumns: ['title', 'site', 'sitePagesBundleWorkflowStatus', 'status', 'updatedAt'],
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
          actions: ['./components/CollectionQuickActions#PageListQuickAction'],
        },
      },
    },
  },
  hooks: {
    beforeChange: [validateCategoriesMatchSite, validateSlugLocaleUnique('pages')],
    afterChange: [pageLinkGraphSync],
  },
  access: loggedInSuperAdminAccessFor('pages'),
  fields: [...postLikeFields, ...sitePagesBundleFields],
}
