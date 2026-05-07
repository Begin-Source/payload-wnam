import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { articleSeoFields } from '@/collections/shared/articleSeoFields'
import { postLikeFields } from '@/collections/shared/postLikeFields'
import { validateSlugLocaleUnique } from '@/collections/shared/validateSlugLocaleUnique'
import { articleAfterChangeWorkflow } from '@/collections/hooks/articleAfterChangeWorkflow'
import { articleBeforeReadAffiliate } from '@/collections/hooks/articleBeforeReadAffiliate'
import { articleLinkBudget } from '@/collections/hooks/articleLinkBudget'
import { pageLinkGraphSync } from '@/collections/hooks/pageLinkGraphSync'
import { setContentCreatedByOnCreate } from '@/collections/hooks/setContentCreatedByOnCreate'
import { articleLifecycleOnPublish } from '@/collections/hooks/articleLifecycleOnPublish'
import { articleAuthorsBelongToSite } from '@/collections/hooks/articleAuthorsBelongToSite'
import { articlePublishGate } from '@/collections/hooks/articlePublishGate'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'
import { validateDocLocaleAgainstSite } from '@/collections/hooks/validateDocLocaleAgainstSite'
import { validateCategoriesMatchSite } from '@/collections/shared/validateCategoriesMatchSite'

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: '文章', plural: '文章' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'title',
    defaultColumns: ['title', 'site', 'status', 'lifecycleStage', 'updatedAt'],
    components: {
      beforeListTable: [
        './components/ArticleFindReplacePanel#FindReplacePanel',
        './components/ArticleCsvImportExport#CsvImportExportPanel',
      ],
      listMenuItems: [
        './components/ArticleFindReplacePanel#FindReplaceListMenuItem',
        './components/ArticleCsvImportExport#CsvImportExportListMenuItem',
      ],
    },
  },
  hooks: {
    beforeValidate: [articleLinkBudget],
    beforeChange: [
      setContentCreatedByOnCreate,
      validateSiteFieldWithinVisibilityScope,
      validateCategoriesMatchSite,
      validateDocLocaleAgainstSite,
      validateSlugLocaleUnique('articles'),
      articleAuthorsBelongToSite,
      articleLifecycleOnPublish,
      articlePublishGate,
    ],
    beforeRead: [articleBeforeReadAffiliate],
    afterChange: [articleAfterChangeWorkflow, pageLinkGraphSync],
  },
  access: siteScopedCollectionAccess('articles'),
  fields: [
    ...postLikeFields,
    {
      name: 'relatedOffers',
      type: 'relationship',
      relationTo: 'offers',
      hasMany: true,
      label: 'Featured products (AMZ)',
      admin: {
        position: 'sidebar',
        description:
          '仅在 amz-template-1 文章详情底部展示联盟商品卡；仅显示 status=active 且 sites 为空或含本站点的 offers。',
      },
      filterOptions: ({ data }) => {
        const raw = data?.site as { id?: number } | number | null | undefined
        const siteId =
          raw != null && typeof raw === 'object' && 'id' in raw
            ? Number((raw as { id: number }).id)
            : typeof raw === 'number'
              ? raw
              : undefined
        const active = { status: { equals: 'active' as const } }
        if (siteId == null || !Number.isFinite(siteId)) return active
        return {
          and: [
            active,
            {
              or: [{ sites: { exists: false } }, { sites: { contains: siteId } }],
            },
          ],
        }
      },
    },
    {
      name: 'affiliatePageLayout',
      type: 'select',
      defaultValue: 'default',
      index: true,
      label: 'Affiliate 页布局',
      admin: {
        position: 'sidebar',
        description:
          'default：标准博客。commercial_hub：清单/Deal，信息密度高。product_comparison：X vs Y / 多品对比，与 Hub 同壳、表格更宽。editorial_review：长文信任向，主栏阅读。正文均用下方 body；联盟链接与披露仍按系统规则。',
      },
      options: [
        { label: '默认（标准博客）', value: 'default' },
        { label: '商业清单 / Deal（Hub）', value: 'commercial_hub' },
        { label: '产品对比', value: 'product_comparison' },
        { label: '长文编辑 / 评测', value: 'editorial_review' },
      ],
    },
    ...articleSeoFields,
    {
      type: 'collapsible',
      label: '成本与归属',
      admin: {
        position: 'sidebar',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'createdBy',
          type: 'relationship',
          relationTo: 'users',
          label: '创建人',
          admin: {
            readOnly: true,
            description: '用于 AI 成本归属与分成；创建时自动写入，之后不可改。',
          },
        },
        {
          name: 'aiCostUsd',
          type: 'number',
          defaultValue: 0,
          admin: { readOnly: true, step: 0.0001 },
        },
        {
          name: 'aiCostBreakdown',
          type: 'json',
          admin: {
            readOnly: true,
            description: '按次追加的 AI 费用明细（最多保留 50 条）。',
          },
        },
      ],
    },
  ],
}
