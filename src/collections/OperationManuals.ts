import type { Access, CollectionConfig } from 'payload'

import { lexicalEditorWithAi } from '@/utilities/lexicalEditorWithAi'

import { adminGroups } from '@/constants/adminGroups'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'
import {
  userIsAnnouncementsPortalOnly,
  denyPortalAndFinanceCollection,
} from '@/utilities/userAccessTiers'
import type { Config } from '@/payload-types'

const loggedIn: Access = ({ req: { user } }) => Boolean(user)

function canWriteOperationManual(user: Config['user'] | null | undefined): boolean {
  if (!isUsersCollection(user)) return false
  if (userHasUnscopedAdminAccess(user)) return true
  if (userHasRole(user, 'system-admin')) return true
  if (userHasTenantGeneralManagerRole(user)) return true
  if (userHasRole(user, 'ops-manager')) return true
  return false
}

const writeAccess: Access = ({ req: { user } }) => {
  if (userIsAnnouncementsPortalOnly(user)) return false
  return canWriteOperationManual(user)
}

export const OperationManuals: CollectionConfig = {
  slug: 'operation-manuals',
  labels: { singular: '编辑手册', plural: '编辑手册' },
  admin: {
    group: adminGroups.knowledge,
    useAsTitle: 'title',
    defaultColumns: ['title', 'level', 'status', 'sortOrder', 'updatedAt'],
    listSearchableFields: ['title', 'summary', 'slug', 'searchKeywords'],
    description: '系统操作说明；一线员工可阅读，仅管理员与指定角色可编辑。',
    components: {
      beforeListTable: [
        './components/ArticleFindReplacePanel#FindReplacePanel',
        './components/ArticleCsvImportExport#CsvImportExportPanel',
      ],
      listMenuItems: [
        './components/ArticleFindReplacePanel#FindReplaceListMenuItem',
        './components/ArticleCsvImportExport#CsvImportExportListMenuItem',
      ],
    },
  },
  access: {
    read: denyPortalAndFinanceCollection(
      'operation-manuals',
      superAdminOrTenantGMPasses(loggedIn),
    ),
    create: denyPortalAndFinanceCollection('operation-manuals', writeAccess),
    update: denyPortalAndFinanceCollection('operation-manuals', writeAccess),
    delete: denyPortalAndFinanceCollection('operation-manuals', writeAccess),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
      admin: { description: '可选，用于稳定链接与检索。' },
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: '入门', value: 'intro' },
        { label: '标准', value: 'standard' },
        { label: '进阶', value: 'advanced' },
      ],
      admin: { description: '操作难度 / 受众级别。' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: '草稿', value: 'draft' },
        { label: '已发布', value: 'published' },
      ],
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: { description: '列表展示与搜索摘要。' },
    },
    {
      name: 'searchKeywords',
      type: 'textarea',
      admin: {
        description: '可选；逗号或空格分隔，补充列表搜索（正文不在默认搜索范围内）。',
      },
    },
    {
      name: 'body',
      type: 'richText',
      editor: lexicalEditorWithAi(),
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: '同级别内排序，数字越小越靠前。',
      },
    },
  ],
}
