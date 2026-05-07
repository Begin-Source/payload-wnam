import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { DEFAULT_QUICK_WIN_FILTER } from '@/utilities/quickWinFilter'
import { getTenantIdsForUser, tenantIdFromRelation } from '@/utilities/tenantScope'
import { userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

const ensureUniqueTenantSlug: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const merged = {
    ...(originalDoc as Record<string, unknown> | undefined),
    ...(data as Record<string, unknown>),
  }
  const tenantId = tenantIdFromRelation(merged.tenant as number | { id: number } | null | undefined)
  const slug = typeof merged.slug === 'string' ? merged.slug.trim().toLowerCase() : ''
  if (tenantId == null || !slug) return data

  const { docs } = await req.payload.find({
    collection: 'keyword-batch-presets',
    where: {
      and: [{ tenant: { equals: tenantId } }, { slug: { equals: slug } }],
    },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })

  const selfId = originalDoc?.id
  for (const d of docs) {
    if (selfId != null && d.id === selfId) continue
    throw new Error(`该租户下已存在 slug「${slug}」的关键词排产预设，请编辑现有记录。`)
  }
  return data
}

const enforceAssignedTenantOnly: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const user = req.user
  if (!isUsersCollection(user)) return data
  if (userHasUnscopedAdminAccess(user)) return data
  if (userHasTenantGeneralManagerRole(user)) return data

  const merged = {
    ...(originalDoc as Record<string, unknown> | undefined),
    ...(data as Record<string, unknown>),
  }
  const tenantId = tenantIdFromRelation(merged.tenant as number | { id: number } | null | undefined)
  if (tenantId == null) return data
  const allowed = getTenantIdsForUser(user)
  if (!allowed.includes(tenantId)) {
    throw new Error('无权为该租户创建或修改关键词排产预设。')
  }
  return data
}

export const KeywordBatchPresets: CollectionConfig = {
  slug: 'keyword-batch-presets',
  labels: { singular: '关键词排产预设', plural: '关键词排产预设' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'tenant', 'batchMode', 'updatedAt'],
    description:
      '按租户配置「默认 / Quick-win」批量入队的默认值；站点可选关联一条，关键词列表排产弹窗将预填（可覆盖）。',
  },
  access: loggedInSuperAdminAccessFor('keyword-batch-presets'),
  hooks: {
    beforeValidate: [ensureUniqueTenantSlug],
    beforeChange: [enforceAssignedTenantOnly],
  },
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
        description: '租户内唯一；小写字母、数字、连字符。',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: '说明',
      admin: { description: '可选；实验假设或给运营看的备注。' },
    },
    {
      name: 'batchMode',
      type: 'select',
      label: '排产模式',
      required: true,
      defaultValue: 'default',
      options: [
        { label: '默认（active→机会分）', value: 'default' },
        { label: 'Quick-win（过滤 + 可选聚类）', value: 'quick_wins' },
      ],
      admin: {
        description:
          '用于关键词列表预填：default 对应「默认排产 · Brief」；quick_wins 对应「精选 Quick-win」表单项。',
      },
    },
    {
      name: 'defaultBatchLimit',
      type: 'number',
      label: '本批入队上限（预填）',
      admin: {
        description:
          '可选。留空表示弹窗不预填上限，仍由服务端 defaultLimit / Quick-win 推导。1–100。',
        step: 1,
      },
      min: 1,
      max: 100,
    },
    {
      type: 'collapsible',
      label: 'Quick-win 过滤（仅当模式为 Quick-win 时用于预填）',
      admin: {
        initCollapsed: false,
        condition: (_, sibling) =>
          sibling &&
          typeof sibling === 'object' &&
          (sibling as { batchMode?: string }).batchMode === 'quick_wins',
      },
      fields: [
        {
          name: 'eligibleOnly',
          type: 'checkbox',
          label: '仅 eligible',
          defaultValue: DEFAULT_QUICK_WIN_FILTER.eligibleOnly,
        },
        {
          name: 'intentWhitelist',
          type: 'text',
          label: '意图（逗号分隔）',
          defaultValue: DEFAULT_QUICK_WIN_FILTER.intentWhitelist.join(', '),
          admin: {
            description: 'informational | navigational | commercial | transactional',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'minVolume',
              type: 'number',
              label: '最小 Volume',
              defaultValue: DEFAULT_QUICK_WIN_FILTER.minVolume,
              min: 0,
            },
            {
              name: 'maxVolume',
              type: 'number',
              label: '最大 Volume',
              defaultValue: DEFAULT_QUICK_WIN_FILTER.maxVolume,
              min: 0,
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'maxKd',
              type: 'number',
              label: '最大 KD（含）',
              defaultValue: DEFAULT_QUICK_WIN_FILTER.maxKd,
              min: 0,
              max: 100,
            },
            {
              name: 'maxPick',
              type: 'number',
              label: '单次 maxPick',
              defaultValue: DEFAULT_QUICK_WIN_FILTER.maxPick,
              min: 1,
              max: 100,
            },
          ],
        },
        {
          name: 'clusterBeforeEnqueue',
          type: 'checkbox',
          label: '入队前 SERP 聚类',
          defaultValue: true,
        },
        {
          name: 'clusterMinOverlap',
          type: 'number',
          label: 'SERP 重叠阈值（2–6）',
          defaultValue: 3,
          min: 2,
          max: 6,
        },
      ],
    },
  ],
}
