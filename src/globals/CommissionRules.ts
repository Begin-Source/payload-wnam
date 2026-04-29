import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import {
  canReadCommissionRulesGlobal,
  canUpdateCommissionRulesGlobal,
} from '@/utilities/financeRoleAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'

export const CommissionRules: GlobalConfig = {
  slug: 'commission-rules',
  label: '佣金规则',
  admin: {
    group: adminGroups.finance,
    hidden: ({ user }) => !canReadCommissionRulesGlobal(user),
  },
  access: {
    read: ({ req: { user } }) => {
      if (announcementsPortalBlocksGlobal(user, 'commission-rules')) return false
      return userHasUnscopedAdminAccess(user) || canReadCommissionRulesGlobal(user)
    },
    update: ({ req: { user } }) => {
      if (announcementsPortalBlocksGlobal(user, 'commission-rules')) return false
      return canUpdateCommissionRulesGlobal(user)
    },
  },
  fields: [
    {
      name: 'rules',
      type: 'json',
      label: '规则配置',
      admin: {
        description: 'JSON for default splits, floors, approval policy, etc.',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
