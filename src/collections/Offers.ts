import type { CollectionConfig } from 'payload'

import { sanitizeOffersMerchantJsonFields } from '@/collections/shared/sanitizeMerchantJsonFields'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'

export const Offers: CollectionConfig = {
  slug: 'offers',
  labels: { singular: 'Offer', plural: 'Offer' },
  admin: {
    group: adminGroups.business,
    useAsTitle: 'title',
    defaultColumns: [
      'title',
      'network',
      'status',
      'merchantSlot.workflowStatus',
      'updatedAt',
    ],
    components: {
      views: {
        list: {
          actions: ['./components/CollectionQuickActions#OfferListQuickAction'],
        },
      },
    },
  },
  access: loggedInSuperAdminAccessFor('offers'),
  hooks: {
    afterRead: [sanitizeOffersMerchantJsonFields],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
    },
    {
      name: 'network',
      type: 'relationship',
      relationTo: 'affiliate-networks',
      required: true,
      admin: {
        description: '必选。请先在本站「联盟」集合至少新建一条联盟，再在此处选择。',
      },
    },
    {
      name: 'sites',
      type: 'relationship',
      relationTo: 'sites',
      hasMany: true,
      admin: { description: 'Sites allowed to promote this offer (optional).' },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: {
        description: '用于 /products 与 /categories/[slug] 中按分类展示。',
      },
      filterOptions: ({ data }) => {
        const raw = data?.sites
        const ids = Array.isArray(raw)
          ? raw.map((s) => (typeof s === 'number' ? s : (s as { id?: number }).id)).filter(Boolean)
          : []
        return ids.length ? { site: { in: ids } } : true
      },
    },
    {
      name: 'featuredOnHomeForSites',
      type: 'relationship',
      relationTo: 'sites',
      hasMany: true,
      admin: {
        description: '勾选的站点会在首页 Featured 区展示该 offer。',
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
        { label: 'Paused', value: 'paused' },
      ],
    },
    {
      name: 'externalId',
      type: 'text',
      label: 'External / network offer ID',
    },
    {
      name: 'targetUrl',
      type: 'text',
      label: 'Tracking or landing URL',
    },
    {
      name: 'commissionNotes',
      type: 'textarea',
      label: 'Commission terms (free text)',
    },
    {
      type: 'group',
      name: 'amazon',
      label: 'Amazon / merchant',
      fields: [
        { name: 'asin', type: 'text', index: true },
        { name: 'priceCents', type: 'number' },
        { name: 'currency', type: 'text', defaultValue: 'USD' },
        { name: 'ratingAvg', type: 'number' },
        { name: 'reviewCount', type: 'number' },
        { name: 'imageUrl', type: 'text' },
        { name: 'primeEligible', type: 'checkbox', defaultValue: false },
        {
          name: 'merchantLastSyncedAt',
          type: 'text',
          label: 'Merchant 最后同步时间',
          admin: {
            description:
              '存 ISO 8601 字符串。使用 text 而非 date，避免库内非 ISO 值在列表 find 时被 Drizzle 解码为 Date 并 toISOString() 抛错。',
          },
        },
        { name: 'merchantRaw', type: 'json' },
        {
          name: 'dfsSnapshot',
          type: 'json',
          admin: {
            description:
              'DataForSEO 原始条目快照（入库前缩短 URL；卖点类字段 features/functions/bullet_* 优先保留并按字节渐进裁剪 product_information）。超长仍会标记 _snapshot_truncated。',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'merchantSlot',
      label: 'DataForSEO / 分类槽位',
      admin: {
        position: 'sidebar',
        description: 'DataForSEO Merchant 类目拉品批次与槽位来源追溯。',
      },
      fields: [
        {
          name: 'workflowStatus',
          type: 'select',
          defaultValue: 'idle',
          options: [
            { label: 'Idle', value: 'idle' },
            { label: 'Running', value: 'running' },
            { label: 'Done', value: 'done' },
            { label: 'Error', value: 'error' },
          ],
          admin: {
            readOnly: true,
            listView: { label: '槽位拉取' },
            components: {
              Cell: './components/OfferMerchantSlotWorkflowCell#OfferMerchantSlotWorkflowCell',
            },
          },
        },
        {
          name: 'workflowLog',
          type: 'textarea',
          admin: {
            readOnly: true,
            rows: 5,
          },
        },
        {
          name: 'workflowUpdatedAt',
          type: 'text',
          label: '槽位流程最后更新',
          admin: {
            readOnly: true,
            description:
              'ISO 8601 字符串。text 避免非 ISO 入库值在 Admin 列表 SSR 时触发 Invalid time value。',
          },
        },
        {
          name: 'sourceCategoryId',
          type: 'number',
          label: '来源分类 ID（槽位）',
          admin: {
            readOnly: true,
            description:
              '本条类目槽位流水线的来源分类 ID；避免与顶层 categories 关系重复 JOIN categories。可选。',
          },
        },
        {
          name: 'batchId',
          type: 'text',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'lastPayload',
          type: 'textarea',
          admin: {
            readOnly: true,
            rows: 6,
            description:
              '最后一次快捷操作请求的摘要 JSON 字符串（调试用）；使用 textarea 可避免 Drizzle 对 JSON TEXT 模式的自动 decode 在映射错位时 SSR 报错。',
          },
        },
      ],
    },
  ],
}
