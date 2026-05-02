import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import {
  requireSiteOnCreate,
  siteScopedSiteField,
} from '@/collections/shared/siteScopedSiteField'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: '分类', plural: '分类' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'name',
    defaultColumns: [
      'name',
      'slug',
      'site',
      'categorySlotsWorkflowStatus',
      'merchantOfferFetchWorkflowStatus',
      'updatedAt',
    ],
    components: {
      beforeListTable: ['./components/ArticleCsvImportExport#CsvImportExportPanel'],
      listMenuItems: ['./components/ArticleCsvImportExport#CsvImportExportListMenuItem'],
      views: {
        list: {
          actions: ['./components/CollectionQuickActions#CategoryListQuickAction'],
        },
      },
    },
  },
  hooks: {
    beforeChange: [requireSiteOnCreate],
  },
  access: loggedInSuperAdminAccessFor('categories'),
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
      name: 'kind',
      type: 'select',
      defaultValue: 'article',
      index: true,
      options: [
        { label: '通用 / 文章', value: 'article' },
        { label: '指南 (Guides)', value: 'guide' },
        { label: '评测 / Reviews', value: 'review' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Guides：`kind=指南` 仅用于 Guides 顶部 chip；Reviews 列表会自动排除只属于指南分类的文章。`kind=评测` 与一般文章一样参与 Reviews，仅作语义区分。',
      },
    },
    siteScopedSiteField,
    {
      name: 'slotIndex',
      type: 'number',
      label: '槽位序号',
      min: 1,
      max: 5,
      admin: {
        position: 'sidebar',
        description:
          '可选。1–5 由「快捷操作 · 生成分类槽位」管理；留空表示手工分类。',
      },
    },
    {
      name: 'categorySlotsWorkflowStatus',
      type: 'text',
      label: '分类槽位流程状态',
      defaultValue: 'idle',
      admin: {
        readOnly: true,
        description:
          '由「快捷操作 · 生成分类槽位」直接写入本分类（idle / running / done / error）。同站点下各分类通常一致。',
        listView: {
          label: '槽位流程',
        },
        components: {
          Cell: './components/CategorySlotsWorkflowStatusCell#CategorySlotsWorkflowStatusCell',
        },
      },
    },
    {
      name: 'merchantOfferFetchWorkflowStatus',
      type: 'text',
      label: '拉品槽位流程',
      defaultValue: 'idle',
      admin: {
        readOnly: true,
        description:
          'DataForSEO Merchant → Offers（idle / running / done / error）。快捷操作写入。',
        listView: {
          label: 'Merchant 拉品',
        },
        components: {
          Cell: './components/CategoryMerchantOfferFetchWorkflowCell#CategoryMerchantOfferFetchWorkflowCell',
        },
      },
    },
    {
      name: 'merchantOfferFetchWorkflowLog',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        readOnly: true,
        rows: 4,
      },
    },
    {
      name: 'merchantOfferFetchDfTaskTag',
      type: 'text',
      label: '最近一次 DFS tag',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'merchantOfferFetchLastBatchId',
      type: 'text',
      label: '最近一次批次 ID',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'merchantOfferFetchLastSummary',
      type: 'textarea',
      label: '拉品摘要 JSON',
      admin: {
        readOnly: true,
        rows: 8,
        position: 'sidebar',
        description:
          'JSON 字符串（调试用）。使用 textarea 避免 Drizzle SQLite JSON 列在 relational map 时出现 decode 错位导致 Admin 空白。',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: '封面图',
      admin: {
        description:
          '首页 / Products 分类卡封面；也可用「Together 分类封面」快捷批量生成。',
        position: 'sidebar',
      },
    },
  ],
}
