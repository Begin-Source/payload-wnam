import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSuperAdminLikeUser } from '@/utilities/isSuperAdminLikeUser'
import { userHasAllTenantAccess } from '@/utilities/superAdmin'

export const AdminBranding: GlobalConfig = {
  slug: 'admin-branding',
  label: '白标与外观',
  admin: {
    group: adminGroups.system,
    hidden: ({ user }) => !isSuperAdminLikeUser(user),
  },
  access: {
    read: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'admin-branding')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'admin-branding')) return false
      return userHasAllTenantAccess(args.req.user)
    },
    update: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'admin-branding')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'admin-branding')) return false
      return userHasAllTenantAccess(args.req.user)
    },
  },
  fields: [
    {
      name: 'brandName',
      type: 'text',
      label: 'Product / brand name',
      admin: {
        description:
          'Shown in the admin browser tab as “… | {name}” instead of “… - Payload”. If empty, use env `NEXT_PUBLIC_ADMIN_BRAND_NAME` as fallback; if that is also unset, only the Payload suffix is removed (page name only).',
      },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          '建议：PNG（透明底）或 SVG；横向 Logo 宽度约 120–240px、高度约 24–48px 即可在侧栏清晰显示；若只用栅格图，可提供 2x 分辨率（例如高 48–64px）以适配高清屏。亦可上传正方形主图，系统会按比例缩放。单文件请小于媒体库上限（推荐 <500KB）。',
      },
    },
    {
      name: 'primaryColor',
      type: 'text',
      label: 'Primary color (hex)',
      admin: { description: 'e.g. #0f172a' },
    },
    {
      name: 'supportEmail',
      type: 'email',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
