import type { GlobalConfig } from 'payload'

import { blogChromeGlobalFields } from '@/collections/shared/blogPublicFields'
import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { superAdminPasses } from '@/utilities/superAdminPasses'

/** App-wide fallback when no `sites` row matches Host / dev slug. */
export const PublicLanding: GlobalConfig = {
  slug: 'public-landing',
  label: '系统文案',
  admin: {
    group: adminGroups.system,
    description: '未匹配到具体站点域名时使用；各站点可在「站点」里覆盖。',
    hidden: ({ user }) => !isSystemConfigNavVisible(user),
  },
  access: {
    read: ({ req: { user } }) => {
      if (announcementsPortalBlocksGlobal(user, 'public-landing')) return false
      if (financeOnlyBlocksGlobal(user, 'public-landing')) return false
      return true
    },
    update: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'public-landing')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'public-landing')) return false
      return superAdminPasses(() => false)(args)
    },
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      label: '网站名称（主标题 · 未登录）',
      required: true,
      defaultValue: '基源科技',
    },
    {
      name: 'browserTitle',
      type: 'text',
      label: '浏览器标签标题',
      admin: { description: '留空则与网站名称相同。' },
    },
    {
      name: 'tagline',
      type: 'text',
      label: '副标题（未登录）',
      defaultValue: '云系统',
    },
    {
      name: 'loggedInTitle',
      type: 'text',
      label: '主标题（已登录）',
      defaultValue: '欢迎回到基源科技',
    },
    {
      name: 'loggedInSubtitle',
      type: 'textarea',
      label: '副标题（已登录）',
      defaultValue: '安全登录后即可管理后台与业务数据',
    },
    {
      name: 'footerLine',
      type: 'textarea',
      label: '页脚一行',
      defaultValue: '© 基源科技 · 内部系统请勿外传',
    },
    {
      name: 'adminCtaLabel',
      type: 'text',
      label: '管理后台按钮',
      defaultValue: '前往管理后台',
    },
    {
      name: 'backgroundColor',
      type: 'text',
      label: '背景色（CSS）',
      defaultValue: '#000000',
    },
    {
      name: 'textColor',
      type: 'text',
      label: '主文字色',
      defaultValue: '#ffffff',
    },
    {
      name: 'mutedTextColor',
      type: 'text',
      label: '次要文字色',
      defaultValue: 'rgba(255, 255, 255, 0.55)',
    },
    {
      name: 'ctaBackgroundColor',
      type: 'text',
      label: '主按钮背景色',
      defaultValue: '#ffffff',
    },
    {
      name: 'ctaTextColor',
      type: 'text',
      label: '主按钮文字色',
      defaultValue: '#000000',
    },
    {
      name: 'fontPreset',
      type: 'select',
      label: '字体',
      defaultValue: 'system',
      options: [
        { label: '系统无衬线', value: 'system' },
        { label: '衬线（Georgia）', value: 'serif' },
        { label: '思源黑体 Noto Sans SC', value: 'noto_sans_sc' },
      ],
    },
    {
      type: 'collapsible',
      label: '博客前台 · 全局兜底',
      admin: { initCollapsed: true },
      fields: blogChromeGlobalFields,
    },
  ],
}
