import type { CollectionConfig } from 'payload'

import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'

const layoutKeyOptions: { label: string; value: string }[] = [
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
    label: 'amz-template-2（旧版结构 · TOC / ASIN 商品页）',
    value: 'amz-template-2',
  },
]

/**
 * 目录型集合：与 `sites.siteLayout` 下拉值一一对应，便于集中维护说明与预览链接（非站点上的实际存储）。
 */
export const SiteLayouts: CollectionConfig = {
  slug: 'site-layouts',
  labels: { singular: '站点布局', plural: '站点布局' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'name',
    defaultColumns: ['name', 'layoutKey', 'sortOrder', 'updatedAt'],
  },
  access: loggedInSuperAdminAccessFor('site-layouts'),
  defaultSort: 'sortOrder',
  fields: [
    {
      name: 'layoutKey',
      type: 'select',
      label: '布局键',
      required: true,
      unique: true,
      options: layoutKeyOptions,
      admin: {
        description: '需与编辑站点时选择的布局值一致；全库仅允许一条/键。',
      },
    },
    {
      name: 'name',
      type: 'text',
      label: '名称',
      required: true,
      admin: {
        description: '与侧栏「网站 → 站点」里「站点布局」选项展示一致；本集合仅作说明与预览链接，不替代站点上存储的布局值。',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: '说明',
      admin: {
        description: '给编辑/运营看的整站壳说明（不直接驱动前台，前台仍读 `sites.siteLayout`）。',
      },
    },
    {
      name: 'previewUrl',
      type: 'text',
      label: '预览链接',
      admin: {
        description: '可填本环境或 staging 的完整 URL；保存后在详情页复制或新窗口打开。部署域名不同时请按需修改。',
      },
    },
    {
      name: 'sortOrder',
      type: 'number',
      label: '排序',
      defaultValue: 0,
      admin: { description: '列表中从小到大排列。' },
    },
  ],
}
