import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { superAdminPasses } from '@/utilities/superAdminPasses'

export const QuotaRules: GlobalConfig = {
  slug: 'quota-rules',
  label: '配额规则',
  admin: {
    group: adminGroups.system,
    hidden: ({ user }) => !isSystemConfigNavVisible(user),
  },
  access: {
    read: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'quota-rules')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'quota-rules')) return false
      return superAdminPasses(() => false)(args)
    },
    update: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'quota-rules')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'quota-rules')) return false
      return superAdminPasses(() => false)(args)
    },
  },
  fields: [
    {
      name: 'rules',
      type: 'json',
      label: '规则配置',
      admin: {
        description:
          'JSON：站点/租户上限等。SEO 矩阵示例：`{ "maxSitesPerTenant": 50 }`（非超管新建站点时校验；≤0 或不填表示不限制）。',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
