import type { CollectionConfig } from 'payload'

import { sitesCollectionAccess } from '@/collections/access/sitesAccess'
import { syncBlueprintsMirroredLayoutAfterSiteChange } from '@/collections/hooks/syncBlueprintMirroredLayout'
import { fillSitesOptionalDbFields } from '@/collections/hooks/fillSitesOptionalDbFields'
import { deleteSiteCascadeBeforeDelete } from '@/collections/hooks/deleteSiteCascade'
import { setSitesCreatedByOnCreate } from '@/collections/hooks/setSitesCreatedByOnCreate'
import { auditSitesMatrixChange } from '@/collections/hooks/sitesMatrixAudit'
import { enforceSitesMatrixQuota } from '@/collections/hooks/sitesMatrixQuota'
import { validateSitesPublicLocales } from '@/collections/hooks/validateSitesPublicLocales'
import { adminGroups } from '@/constants/adminGroups'
import { denyPortalAndFinanceCollection } from '@/utilities/userAccessTiers'
import { localeSelectOptions } from '@/i18n/localeRegistry'

export const Sites: CollectionConfig = {
  slug: 'sites',
  labels: { singular: '站点', plural: '站点' },
  /** When `sites` is populated from relationships (e.g. categories list), include labels without loading full rows. */
  defaultPopulate: {
    name: true,
    slug: true,
    createdBy: true,
  },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'name',
    defaultColumns: [
      'name',
      'slug',
      'createdBy',
      'portfolio',
      'status',
      'domainWorkflowStatus',
      'primaryDomain',
      'updatedAt',
    ],
    components: {
      views: {
        list: {
          actions: ['./components/CollectionQuickActions#SiteListQuickAction'],
        },
      },
    },
  },
  access: {
    read: denyPortalAndFinanceCollection('sites', sitesCollectionAccess.read),
    create: denyPortalAndFinanceCollection('sites', sitesCollectionAccess.create),
    update: denyPortalAndFinanceCollection('sites', sitesCollectionAccess.update),
    delete: denyPortalAndFinanceCollection('sites', sitesCollectionAccess.delete),
  },
  hooks: {
    beforeDelete: [deleteSiteCascadeBeforeDelete],
    beforeChange: [
      setSitesCreatedByOnCreate,
      fillSitesOptionalDbFields,
      validateSitesPublicLocales,
      enforceSitesMatrixQuota,
    ],
    afterChange: [
      syncBlueprintsMirroredLayoutAfterSiteChange,
      auditSitesMatrixChange,
    ],
  },
  fields: [
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      label: '创建人',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          '站长仅可见自己创建的站点；组长可见本人及团队在籍站长创建的站点。总经理 / 运营经理可见租户内全部（含历史未填创建人的站点）。创建站点时始终记录为当前登录用户，保存后不可更改。',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
      admin: {
        description:
          'URL-safe key; pair with tenant for uniqueness in your workflows. 列表「快捷操作 · 生成域名」在写回主域名时会将 slug 同步为小写并把域名中的点替换为连字符。新建时若留空，会按名称自动生成占位 slug。',
      },
    },
    {
      name: 'primaryDomain',
      type: 'text',
      label: 'Primary domain',
      admin: {
        description: '可留空；入库前会存为空字符串，稍后可由域名生成流程或手工补全。',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      admin: {
        description: '可留空；未选择时按 draft 写入数据库。',
      },
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      name: 'portfolio',
      type: 'relationship',
      relationTo: 'site-portfolios',
      label: '站点组合',
      admin: {
        description: 'SEO 矩阵：项目/批次分组，便于筛选与批量运营。',
      },
    },
    {
      name: 'pipelineProfile',
      type: 'relationship',
      relationTo: 'pipeline-profiles',
      label: '流水线配置',
      admin: {
        description:
          '可选。指定后本站关键词同步与文章流水线默认使用该配置（覆盖全局 SEO 流水线）。留空则用租户默认或全局。',
      },
      filterOptions: ({ data }) => {
        const raw = (data as { tenant?: number | { id: number } | null })?.tenant
        const tid =
          raw != null && typeof raw === 'object' && 'id' in raw
            ? Number((raw as { id: number }).id)
            : typeof raw === 'number'
              ? raw
              : null
        if (tid == null || !Number.isFinite(tid)) return false
        return { tenant: { equals: tid } }
      },
    },
    {
      name: 'siteLayout',
      type: 'select',
      label: '站点布局',
      defaultValue: 'template1',
      options: [
        { label: 'Template1（整站顶栏 + 主从栏 + 页脚）', value: 'template1' },
        {
          label: 'Template2（同结构 · 第二套主题；文案 t2LocaleJson）',
          value: 'template2',
        },
        {
          label: 'amz-template-1（Amazon 联盟测评风 · 顶栏/底栏/主题变量）',
          value: 'amz-template-1',
        },
        {
          label: 'amz-template-2（旧版 amz-template 全站结构 · TOC / 可扩展 ASIN 路由）',
          value: 'amz-template-2',
        },
      ],
      admin: {
        description:
          'Template1 / Template2：文案在「设计」t1LocaleJson / t2LocaleJson。amz-template-1 / amz-template-2：壳层与配色见「设计」amzSiteConfigJson（与 amz-template-1 仓库 site.config 同形）。说明与预览链接见「站点布局」目录。',
      },
    },
    {
      name: 'publicLocaleCodes',
      type: 'select',
      label: '前台启用语言',
      hasMany: true,
      required: true,
      defaultValue: ['zh', 'en'],
      options: localeSelectOptions,
      admin: {
        description:
          'URL 前缀（如 /en、/zh）；至少选一种。新语言需先在代码 localeRegistry 登记后再在此处可选。',
      },
    },
    {
      name: 'defaultPublicLocale',
      type: 'select',
      label: '默认语言',
      required: true,
      defaultValue: 'en',
      options: localeSelectOptions,
      admin: {
        description: '根路径 / 重定向时使用的默认语言；须属于上方「前台启用语言」。',
      },
    },
    {
      name: 'homepageHeroBanner',
      type: 'upload',
      relationTo: 'media',
      label: '首页 Hero 横幅',
      admin: {
        position: 'sidebar',
        description:
          'Together「站点首页横幅」或手工上传：宽屏横幅背景（amz-template-1 / 2 首页 Hero）。需在对应站点设计里配置文案。',
      },
    },
    {
      name: 'siteLogo',
      type: 'upload',
      relationTo: 'media',
      label: '站点 Logo / 浏览器图标',
      admin: {
        position: 'sidebar',
        description:
          '正方形品牌标：AMZ Shell 顶栏与浏览器标签图标共用同一媒体；可用 Together「站点 Logo」生成。未上传且设计 JSON 仍为默认 Lucide 占位时，前台会根据 slug / 主品 / 细分数据推断更贴垂直的图标。',
      },
    },
    {
      name: 'operators',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Users who operate this site (optional; tenant scoping still applies).',
      },
    },
    {
      type: 'collapsible',
      label: '域名生成 / AI（n8n Generate Domain 等价）',
      admin: {
        description:
          '由 POST /api/sites/generate-domain（x-internal-token）写入；含 OpenRouter 建议与 Spaceship 可查结果。',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'mainProduct',
          type: 'text',
          label: '主品 / Main product',
          admin: { description: '用于域名与受众提示词（对应原 n8n main_product）。' },
        },
        {
          name: 'nicheData',
          type: 'json',
          label: '细分数据 niche_data',
          admin: {
            description: 'JSON：建议含 niche、target_audience；流程会清理临时域名建议键。',
          },
        },
        {
          name: 'domainWorkflowStatus',
          type: 'text',
          label: '域名流程状态',
          defaultValue: 'idle',
          admin: {
            description:
              '推荐取值（小写英文）：idle 代办 · running 运行中 · done 已完成 · error 错误。API 与列表徽章按此约定；任意其他值在列表中按代办样式显示。',
            components: {
              Cell: './components/DomainWorkflowStatusCell#DomainWorkflowStatusCell',
            },
          },
        },
        {
          name: 'domainCheckStatus',
          type: 'text',
          label: '可查状态 domain_check_status',
          admin: { description: 'available | unavailable | error（多由 API 写入）。' },
        },
        {
          name: 'domainCheckAvailable',
          type: 'checkbox',
          label: '标准价可用',
          defaultValue: false,
          admin: { description: '由 Spaceship 批量可查结果写入。' },
        },
        {
          name: 'domainCheckAt',
          type: 'date',
          label: '可查时间',
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'domainCheckMessage',
          type: 'textarea',
          label: '可查说明',
        },
        {
          name: 'domainGenerationLog',
          type: 'textarea',
          label: '域名生成日志',
          admin: {
            description: '追加日志，末尾截断约 12000 字符（与 n8n 一致）。',
          },
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
