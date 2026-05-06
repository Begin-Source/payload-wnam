import type { CollectionConfig } from 'payload'

import { blogChromeDesignFields } from '@/collections/shared/blogPublicFields'
import { template1SiteFields, template2SiteFields } from '@/collections/shared/template1SiteFields'
import type { User } from '@/payload-types'
import { adminGroups } from '@/constants/adminGroups'
import {
  syncMirroredLayoutFromSiteBeforeChange,
} from '@/collections/hooks/syncBlueprintMirroredLayout'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import {
  validateSiteFieldWithinVisibilityScope,
} from '@/collections/hooks/validateSiteVisibilityScope'
import {
  requireSiteOnCreate,
  siteScopedSiteField,
} from '@/collections/shared/siteScopedSiteField'
import { workflowIdleRunningDoneErrorSelectOptions } from '@/collections/shared/workflowIdleRunningDoneErrorSelectOptions'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

export const SiteBlueprints: CollectionConfig = {
  slug: 'site-blueprints',
  labels: { singular: '设计', plural: '设计' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'name',
    defaultColumns: [
      'name',
      'slug',
      'site',
      'mirroredSiteLayout',
      'designWorkflowStatus',
      'updatedAt',
    ],
    hidden: ({ user }) =>
      !isSystemConfigNavVisible(user) &&
      !userHasTenantGeneralManagerRole(user as User) &&
      !(
        isUsersCollection(user) &&
        (userHasRole(user, 'site-manager') ||
          userHasRole(user, 'team-lead') ||
          userHasRole(user, 'ops-manager'))
      ),
    components: {
      beforeListTable: ['./components/ArticleCsvImportExport#CsvImportExportPanel'],
      listMenuItems: ['./components/ArticleCsvImportExport#CsvImportExportListMenuItem'],
      views: {
        list: {
          actions: ['./components/CollectionQuickActions#DesignListQuickAction'],
        },
      },
    },
  },
  hooks: {
    beforeChange: [
      requireSiteOnCreate,
      validateSiteFieldWithinVisibilityScope,
      syncMirroredLayoutFromSiteBeforeChange,
    ],
  },
  access: siteScopedCollectionAccess('site-blueprints'),
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
    siteScopedSiteField,
    {
      name: 'mirroredSiteLayout',
      type: 'select',
      label: '镜像：站点布局',
      defaultValue: 'template1',
      options: [
        { label: 'Template1', value: 'template1' },
        { label: 'Template2', value: 'template2' },
        { label: 'amz-template-1', value: 'amz-template-1' },
        { label: 'amz-template-2', value: 'amz-template-2' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          '只读，随关联「站点」的「站点布局」自动同步；用于在下方只展示当前壳层对应的文案区。',
        listView: {
          label: '布局',
        },
        components: {
          Field: './components/MirroredSiteLayoutField#MirroredSiteLayoutField',
        },
      },
    },
    {
      name: 'designWorkflowStatus',
      type: 'select',
      label: '设计流程状态',
      defaultValue: 'idle',
      options: [...workflowIdleRunningDoneErrorSelectOptions],
      admin: {
        description:
          '由 AMZ 设计生成等快捷操作写入；也可在此手工调整（idle / running / done / error）。卡死时可改回 idle。',
        listView: {
          label: '流程',
        },
        components: {
          Cell: './components/DesignWorkflowStatusCell#DesignWorkflowStatusCell',
        },
      },
    },
    {
      name: 'designWorkflowLog',
      type: 'textarea',
      label: '设计流程日志',
      admin: {
        readOnly: true,
        description:
          '由「快捷操作 · 生成 AMZ 设计」等在失败时追加记录（含时间与错误码、详情）；成功或重跑不会清空本日志。仅展示，不可手改。',
        rows: 12,
      },
    },
    {
      name: 'designWorkflowLastErrorCode',
      type: 'text',
      label: '末次错误代码',
      admin: {
        hidden: true,
        readOnly: true,
        description: '由「快捷操作 · 生成 AMZ 设计」在失败时写入（如 OPENROUTER、QUOTA）。成功或重新运行时会清空。',
        listView: {
          label: '错误码',
        },
      },
    },
    {
      name: 'designWorkflowLastErrorDetail',
      type: 'textarea',
      label: '末次错误详情',
      admin: {
        hidden: true,
        readOnly: true,
        description: '失败时的具体原因（可能含上游 API 返回片段）。成功或重新运行时会清空。',
      },
    },
    {
      name: 'designWorkflowLastErrorAt',
      type: 'date',
      label: '末次错误时间',
      admin: {
        hidden: true,
        readOnly: true,
        description: '记录末次写入 error 状态的时间（UTC）。',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'templateConfig',
      type: 'json',
      admin: {
        description: 'Arbitrary JSON for themes, sections, or generator defaults.',
      },
    },
    {
      type: 'collapsible',
      label: '落地页 · 设计微调',
      admin: {
        description:
          '覆盖站点与「公开落地页」全局兜底。镜像为 amz-template-1 / amz-template-2 时请用下方「AMZ · 站点配置 JSON」（含 SEO / 品牌 / 主题色）。',
        initCollapsed: false,
        condition: (_data, siblingData) =>
          siblingData?.mirroredSiteLayout !== 'amz-template-1' &&
          siblingData?.mirroredSiteLayout !== 'amz-template-2',
      },
      fields: [
        {
          name: 'designBrowserTitle',
          type: 'text',
          label: '浏览器标签标题',
        },
        {
          name: 'designSiteName',
          type: 'text',
          label: '主标题（未登录）',
        },
        {
          name: 'designTagline',
          type: 'text',
          label: '副标题（未登录）',
        },
        {
          name: 'designLoggedInTitle',
          type: 'text',
          label: '主标题（已登录）',
        },
        {
          name: 'designLoggedInSubtitle',
          type: 'textarea',
          label: '副标题（已登录）',
        },
        {
          name: 'designFooterLine',
          type: 'textarea',
          label: '页脚一行',
        },
        {
          name: 'designCtaLabel',
          type: 'text',
          label: '管理后台按钮',
        },
        {
          name: 'designBgColor',
          type: 'text',
          label: '背景色',
        },
        {
          name: 'designTextColor',
          type: 'text',
          label: '主文字色',
        },
        {
          name: 'designMutedColor',
          type: 'text',
          label: '次要文字色',
        },
        {
          name: 'designCtaBgColor',
          type: 'text',
          label: '主按钮背景色',
        },
        {
          name: 'designCtaTextColor',
          type: 'text',
          label: '主按钮文字色',
        },
        {
          name: 'designFontPreset',
          type: 'select',
          label: '字体',
          options: [
            { label: '（沿用下层）', value: '' },
            { label: '系统无衬线', value: 'system' },
            { label: '衬线（Georgia）', value: 'serif' },
            { label: '思源黑体 Noto Sans SC', value: 'noto_sans_sc' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: '联盟测评站 · 设计',
      admin: {
        description: '设计优先；站点上遗留的同名 override 未在后台展示时仍参与合并。',
        initCollapsed: true,
        condition: () => false,
      },
      fields: [
        {
          name: 'designReviewHubTagline',
          type: 'text',
          label: '测评站首页副标题',
          admin: {
            description: '留空则下沉到站点遗留值或落地页副标题。',
          },
        },
        {
          name: 'designAffiliateDisclosureLine',
          type: 'textarea',
          label: '联盟声明（页脚上方）',
          admin: {
            description: '留空则下沉到站点遗留值或默认英文短句。',
          },
        },
        {
          name: 'designFooterResourceLinks',
          type: 'json',
          label: 'Resources 链接（JSON 数组）',
          admin: {
            description:
              '例: [{"label":"Privacy","href":"/en/pages/privacy"}]。留空则下沉到站点遗留值。',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: '博客前台 · 设计微调',
      admin: { description: '覆盖整站博客壳与侧栏。', initCollapsed: true },
      fields: blogChromeDesignFields,
    },
    {
      type: 'collapsible',
      label: 'AMZ · 站点配置 JSON（amz-template-1 / amz-template-2）',
      admin: {
        description:
          '与 amz-template-1 仓库 lib/site.config.ts（siteConfig）同形；参见该仓库 CONFIG_GUIDE。留空或缺键时与代码内默认配置 deep merge。',
        initCollapsed: true,
        condition: (_data, siblingData) =>
          siblingData?.mirroredSiteLayout === 'amz-template-1' ||
          siblingData?.mirroredSiteLayout === 'amz-template-2',
      },
      fields: [
        {
          name: 'amzSiteConfigJson',
          type: 'json',
          label: 'AMZ site.config（JSON）',
          admin: {
            description:
              '覆盖品牌、主题色、导航、首页 Hero、页脚等。结构同 siteConfig；未写部分使用内置默认。',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Template1 · 导航 / 首页 / 页脚文案',
      admin: {
        description:
          '仅当镜像为 Template1 时显示；留空则前台用代码默认中英文。键名与历史整站模版/JSON 导入一致。',
        initCollapsed: true,
        condition: (_data, siblingData) => siblingData?.mirroredSiteLayout === 'template1',
      },
      fields: [...template1SiteFields],
    },
    {
      type: 'collapsible',
      label: 'Template2 · 导航 / 首页 / 页脚文案',
      admin: {
        description:
          '仅当镜像为 Template2 时显示；与 Template1 同键。留空则前台用代码默认。',
        initCollapsed: true,
        condition: (_data, siblingData) => siblingData?.mirroredSiteLayout === 'template2',
      },
      fields: [...template2SiteFields],
    },
    {
      name: 'trustAssetsTemplate',
      type: 'json',
      label: 'Trust 页种子',
      admin: { description: 'Lexical or JSON template for /about, /affiliate-disclosure, etc.' },
    },
    { name: 'mainNavTemplate', type: 'json' },
    { name: 'footerTemplate', type: 'json' },
    { name: 'showBreadcrumb', type: 'checkbox', defaultValue: true },
  ],
}
