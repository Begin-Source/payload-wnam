import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import {
  requireSiteOnCreate,
  siteScopedSiteField,
} from '@/collections/shared/siteScopedSiteField'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { financeOnlyBlocksCollection } from '@/utilities/financeRoleAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'
import { getTenantScopeForStats } from '@/utilities/tenantScope'
import {
  announcementsPortalBlocksCollection,
  denyPortalAndFinanceCollection,
} from '@/utilities/userAccessTiers'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: '媒体', plural: '媒体库' },
  admin: {
    group: adminGroups.website,
    defaultColumns: ['alt', 'site', 'aiImageGenStatus', 'filename', 'updatedAt'],
    components: {
      beforeListTable: [
        './components/ArticleFindReplacePanel#FindReplacePanel',
        './components/ArticleCsvImportExport#CsvImportExportPanel',
      ],
      listMenuItems: [
        './components/ArticleFindReplacePanel#FindReplaceListMenuItem',
        './components/ArticleCsvImportExport#CsvImportExportListMenuItem',
      ],
      views: {
        list: {
          actions: ['./components/CollectionQuickActions#MediaListQuickAction'],
        },
      },
    },
  },
  hooks: {
    beforeChange: [requireSiteOnCreate],
  },
  access: {
    read: async ({ req }) => {
      if (announcementsPortalBlocksCollection(req.user, 'media')) return false
      if (financeOnlyBlocksCollection(req.user, 'media')) return false
      if (!req.user) return true
      if (userHasUnscopedAdminAccess(req.user)) return true
      if (!isUsersCollection(req.user)) return false
      const scope = getTenantScopeForStats(req.user)
      if (scope.mode === 'all') return true
      if (scope.mode === 'none') return { id: { equals: 0 } }
      const sitesRes = await req.payload.find({
        collection: 'sites',
        depth: 0,
        limit: 500,
        pagination: false,
        where: { tenant: { in: scope.tenantIds } },
      })
      const siteIds = sitesRes.docs.map((s: { id: number }) => s.id)
      if (siteIds.length === 0) return { id: { equals: 0 } }
      return { site: { in: siteIds } }
    },
    create: denyPortalAndFinanceCollection(
      'media',
      superAdminOrTenantGMPasses(({ req: { user } }) => Boolean(user)),
    ),
    update: denyPortalAndFinanceCollection(
      'media',
      superAdminOrTenantGMPasses(({ req: { user } }) => Boolean(user)),
    ),
    delete: denyPortalAndFinanceCollection(
      'media',
      superAdminOrTenantGMPasses(({ req: { user } }) => Boolean(user)),
    ),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    siteScopedSiteField,
    {
      name: 'assetClass',
      type: 'select',
      defaultValue: 'decorative',
      options: [
        { label: 'Decorative (AI/hero)', value: 'decorative' },
        { label: 'Evidence (test/screenshot)', value: 'evidence' },
      ],
    },
    {
      type: 'collapsible',
      label: 'AI 配图 · Together',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'aiImagePrompt',
          type: 'textarea',
          admin: {
            description:
              '配图提示词。留空时生成阶段会用「Alt」走标题类 fallback；若此项像 URL，也会退回用 Alt。',
          },
        },
        {
          name: 'aiImageGenStatus',
          type: 'select',
          defaultValue: 'idle',
          index: true,
          options: [
            { label: 'Idle', value: 'idle' },
            { label: 'Queued', value: 'queued' },
            { label: 'Running', value: 'running' },
            { label: 'Succeeded', value: 'succeeded' },
            { label: 'Failed', value: 'failed' },
            { label: 'Skipped', value: 'skipped' },
          ],
        },
        {
          name: 'aiImageGenError',
          type: 'text',
          admin: { readOnly: true },
        },
        {
          name: 'aiImageGenAt',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
            readOnly: true,
          },
        },
        {
          name: 'aiImagePromptSource',
          type: 'text',
          admin: {
            readOnly: true,
            description: '上次生成实际采用的提示来源（如 image_prompt / alt_fallback）。',
          },
        },
      ],
    },
  ],
  upload: {
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
  },
}
