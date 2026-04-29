import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import {
  announcementsReadWhere,
  canTeamLeadManageDoc,
  isUsersCollection,
} from '@/utilities/announcementAccess'
import { financeOnlyBlocksCollection } from '@/utilities/financeRoleAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { superAdminOrTenantGMPasses, superAdminPasses } from '@/utilities/superAdminPasses'
import { denyPortalAndFinanceCollection } from '@/utilities/userAccessTiers'
import { userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

type AnnouncementDoc = {
  kind?: 'system' | 'team'
  teamLead?: number | { id: number } | null
}

function teamLeadIdFromDoc(doc: AnnouncementDoc | null | undefined): number | null {
  if (!doc?.teamLead) return null
  return typeof doc.teamLead === 'object' ? doc.teamLead.id : doc.teamLead
}

export const Announcements: CollectionConfig = {
  slug: 'announcements',
  labels: { singular: '通知公告', plural: '通知公告' },
  admin: {
    group: adminGroups.home,
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'tenant', 'isActive', 'updatedAt'],
    description: '系统公告（租户内广播）与团队公告（组长发布给本组）。',
  },
  access: {
    read: denyPortalAndFinanceCollection('announcements', (args) => {
      const u = args.req.user
      if (userHasUnscopedAdminAccess(u)) return true
      if (userHasTenantGeneralManagerRole(u)) {
        return announcementsReadWhere(u)
      }
      return superAdminPasses(({ req: { user: u2 } }) => announcementsReadWhere(u2))(args)
    }),
    create: async ({ req: { user, payload } }) => {
      if (financeOnlyBlocksCollection(user, 'announcements')) return false
      if (!isUsersCollection(user)) return false
      if (userHasUnscopedAdminAccess(user) || userHasTenantGeneralManagerRole(user)) return true
      const subs = await payload.count({
        collection: 'users',
        where: { teamLead: { equals: user.id } },
      })
      return subs.totalDocs > 0
    },
    update: denyPortalAndFinanceCollection(
      'announcements',
      superAdminOrTenantGMPasses(async ({ req, id }) => {
        if (!isUsersCollection(req.user) || !id) return false
        const doc = (await req.payload.findByID({
          collection: 'announcements',
          id,
          depth: 0,
        })) as AnnouncementDoc
        if (doc.kind === 'system') return false
        return canTeamLeadManageDoc(req.user, teamLeadIdFromDoc(doc))
      }),
    ),
    delete: denyPortalAndFinanceCollection(
      'announcements',
      superAdminOrTenantGMPasses(async ({ req, id }) => {
        if (!isUsersCollection(req.user) || !id) return false
        const doc = (await req.payload.findByID({
          collection: 'announcements',
          id,
          depth: 0,
        })) as AnnouncementDoc
        if (doc.kind === 'system') return false
        return canTeamLeadManageDoc(req.user, teamLeadIdFromDoc(doc))
      }),
    ),
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (!isUsersCollection(req.user)) return data

        const kind = data.kind as 'system' | 'team' | undefined
        const isElevated = userHasUnscopedAdminAccess(req.user) || userHasTenantGeneralManagerRole(req.user)

        if (operation === 'create') {
          data.author = req.user.id
        }

        if (!isElevated) {
          if (kind !== 'team') {
            throw new Error('仅超级管理员、系统管理员或总经理可发布系统公告')
          }
          data.teamLead = req.user.id
        } else if (kind === 'system') {
          data.teamLead = null
        } else if (kind === 'team' && data.teamLead === undefined) {
          data.teamLead = req.user.id
        }

        if (data.kind === 'team' && !data.teamLead) {
          throw new Error('团队公告需要指定组长')
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'team',
      options: [
        { label: '系统公告（租户内）', value: 'system' },
        { label: '团队公告', value: 'team' },
      ],
      access: {
        update: ({ req: { user } }) =>
          userHasUnscopedAdminAccess(user) || userHasTenantGeneralManagerRole(user),
      },
      admin: {
        description: '组长仅可创建「团队公告」。系统公告：超级管理员或本租户总经理。',
      },
    },
    {
      name: 'teamLead',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: '团队公告面向该组长及其组员（users.teamLead 指向此用户）。',
        condition: (_, siblingData) => siblingData?.kind === 'team',
      },
      access: {
        update: ({ req: { user } }) =>
          userHasUnscopedAdminAccess(user) || userHasTenantGeneralManagerRole(user),
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: '创建者（自动填充）。',
      },
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'body',
      type: 'textarea',
      required: true,
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'isPinned',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: '置顶显示（前端可按需排序）。' },
    },
    {
      name: 'startsAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'endsAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
