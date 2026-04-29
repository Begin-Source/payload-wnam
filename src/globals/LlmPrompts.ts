import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { superAdminPasses } from '@/utilities/superAdminPasses'

export const LlmPrompts: GlobalConfig = {
  slug: 'llm-prompts',
  label: 'LLM 配置',
  admin: {
    group: adminGroups.operations,
    hidden: ({ user }) => !isSystemConfigNavVisible(user),
  },
  access: {
    read: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'llm-prompts')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'llm-prompts')) return false
      return superAdminPasses(() => false)(args)
    },
    update: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'llm-prompts')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'llm-prompts')) return false
      return superAdminPasses(() => false)(args)
    },
  },
  fields: [
    {
      name: 'defaultModel',
      type: 'text',
      admin: { description: 'Provider model id (e.g. gpt-4o-mini).' },
    },
    {
      name: 'temperature',
      type: 'number',
      defaultValue: 0.7,
      admin: { step: 0.05 },
    },
    {
      name: 'globalSystemPrompt',
      type: 'textarea',
      label: 'Default system prompt',
    },
    {
      name: 'apiNotes',
      type: 'textarea',
      label: 'Provider / key routing notes (no secrets here)',
    },
  ],
}
