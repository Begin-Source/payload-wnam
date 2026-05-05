import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { superAdminPasses } from '@/utilities/superAdminPasses'

export const PromptLibrary: GlobalConfig = {
  slug: 'prompt-library',
  label: '提示词库',
  admin: {
    group: adminGroups.operations,
    hidden: ({ user }) => !isSystemConfigNavVisible(user),
    description:
      '通用技能/运营长文本模板。域名生成（受众+域名建议）请在「租户提示词模板」按租户配置。',
  },
  access: {
    read: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'prompt-library')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'prompt-library')) return false
      return superAdminPasses(() => false)(args)
    },
    update: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'prompt-library')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'prompt-library')) return false
      return superAdminPasses(() => false)(args)
    },
  },
  fields: [
    {
      name: 'entries',
      type: 'array',
      labels: { singular: 'Entry', plural: 'Entries' },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'body',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      name: 'skillOverrides',
      type: 'json',
      label: 'Skill prompt overrides',
      admin: { description: 'Map skillId -> partial system prompt override (used by skillPrompts.get)' },
    },
  ],
}
