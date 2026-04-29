import type { CollectionConfig } from 'payload'

import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'

export const SitePortfolios: CollectionConfig = {
  slug: 'site-portfolios',
  labels: { singular: '站点组合', plural: '站点组合' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
    description:
      'SEO 矩阵：按项目/策略分组多个站点，便于筛选与批量运营（关联到各「站点」的「所属组合」）。',
  },
  access: loggedInSuperAdminAccessFor('site-portfolios'),
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: '名称',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'URL-safe；同一租户内需唯一（与站点 slug 无关）。',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: '备注',
    },
  ],
}
