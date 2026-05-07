import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import {
  briefDepthFieldOptions,
  briefVariantFieldOptions,
  finalizeVariantFieldOptions,
  sectionVariantFieldOptions,
  skeletonVariantFieldOptions,
} from '@/utilities/pipelineVariants'
import { getTenantIdsForUser, tenantIdFromRelation } from '@/utilities/tenantScope'
import { userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

const inheritLabel = '(继承全局默认)'
const withInherit = <T extends string>(opts: readonly { label: string; value: T }[]) => [
  { label: inheritLabel, value: '' },
  ...(opts as { label: string; value: string }[]),
]

const profileOverrideFieldsDescription =
  '以下字段若留空则继承全局 SEO 流水线；填写后仅覆盖对应项。'

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
    collection: 'pipeline-profiles',
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
    throw new Error(`该租户下已存在 slug「${slug}」的 SEO 流水线方案，请编辑现有记录。`)
  }
  return data
}

/**
 * When marking isDefault, clear isDefault on other profiles for the same tenant.
 */
const syncSingleDefaultPerTenant: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  const merged = {
    ...(originalDoc as Record<string, unknown> | undefined),
    ...(data as Record<string, unknown>),
  }
  if (merged.isDefault !== true) return data

  const tenantId = tenantIdFromRelation(merged.tenant as number | { id: number } | null | undefined)
  if (tenantId == null) return data

  const selfId = operation === 'update' && originalDoc?.id != null ? originalDoc.id : null

  const { docs } = await req.payload.find({
    collection: 'pipeline-profiles',
    where: {
      and: [{ tenant: { equals: tenantId } }, { isDefault: { equals: true } }],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  for (const d of docs) {
    if (selfId != null && d.id === selfId) continue
    await req.payload.update({
      collection: 'pipeline-profiles',
      id: d.id,
      data: { isDefault: false },
      overrideAccess: true,
    })
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
    throw new Error('无权为该租户创建或修改 SEO 流水线方案。')
  }
  return data
}

export const PipelineProfiles: CollectionConfig = {
  slug: 'pipeline-profiles',
  labels: { singular: 'SEO 流水线方案', plural: 'SEO 流水线方案' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'tenant', 'isDefault', 'updatedAt'],
    components: {
      views: {
        list: {
          actions: ['./components/PipelineProfilesListActions#PipelineProfilesListActions'],
        },
      },
    },
    description:
      '按租户多套 SEO / AI 流水线参数（覆盖全局 SEO 流水线）。站点或文章可指定其一以做对照试验。',
  },
  access: loggedInSuperAdminAccessFor('pipeline-profiles'),
  hooks: {
    beforeValidate: [ensureUniqueTenantSlug],
    beforeChange: [syncSingleDefaultPerTenant, enforceAssignedTenantOnly],
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
      admin: { description: '可选，记录实验假设或用途。' },
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      label: '租户默认',
      defaultValue: false,
      admin: {
        description: '同一租户仅建议一条为默认；保存时会自动取消其他记录的默认勾选项。',
      },
    },
    {
      type: 'collapsible',
      label: '覆盖项（留空继承全局默认）',
      admin: {
        description: profileOverrideFieldsDescription,
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'tavilyEnabled', type: 'checkbox', label: 'Tavily 开启（覆盖）' },
            { name: 'dataForSeoEnabled', type: 'checkbox', label: 'DataForSEO 开启（覆盖）' },
            { name: 'togetherImageEnabled', type: 'checkbox', label: 'Together 配图开启（覆盖）' },
          ],
        },
        {
          name: 'defaultLlmModel',
          type: 'text',
          label: '默认 LLM（OpenRouter id）',
        },
        {
          name: 'defaultImageModel',
          type: 'text',
          label: '默认生图模型',
        },
        {
          type: 'row',
          fields: [
            { name: 'amazonMarketplace', type: 'text', label: 'Amazon marketplace' },
            { name: 'frugalMode', type: 'checkbox', label: '抠门模式（覆盖）' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'defaultLocale', type: 'text', label: 'defaultLocale' },
            { name: 'defaultRegion', type: 'text', label: 'defaultRegion' },
          ],
        },
        {
          name: 'eeatWeights',
          type: 'json',
          label: 'EEAT 权重 JSON',
        },
        {
          name: 'llmModelsBySection',
          type: 'json',
          label: '按章节模型 JSON',
        },
        {
          type: 'row',
          fields: [
            { name: 'sectionParallelism', type: 'number', label: 'sectionParallelism' },
            { name: 'sectionMaxRetry', type: 'number', label: 'sectionMaxRetry' },
          ],
        },
        {
          name: 'sectionParallelWhitelist',
          type: 'json',
          label: 'sectionParallelWhitelist',
        },
        {
          name: 'amzKeywordEligibility',
          type: 'json',
          label: 'AMZ 关键词资格 JSON',
        },
        {
          type: 'row',
          fields: [
            {
              name: 'briefVariant',
              type: 'select',
              label: 'Brief 打法',
              options: withInherit(briefVariantFieldOptions),
            },
            {
              name: 'skeletonVariant',
              type: 'select',
              label: 'Skeleton 打法',
              options: withInherit(skeletonVariantFieldOptions),
            },
          ],
        },
        {
          name: 'briefVariantConfig',
          type: 'json',
          label: 'Brief 子参数(JSON)',
          admin: {
            condition: (_, sibling) =>
              !!(
                sibling &&
                typeof sibling === 'object' &&
                sibling.briefVariant === 'competitor_mimic'
              ),
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'sectionVariant',
              type: 'select',
              label: 'Section 打法',
              options: withInherit(sectionVariantFieldOptions),
            },
            {
              name: 'finalizeVariant',
              type: 'select',
              label: 'Finalize 打法',
              options: withInherit(finalizeVariantFieldOptions),
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'skeletonVariantConfig',
              type: 'json',
              label: 'Skeleton 子参数',
            },
            {
              name: 'sectionVariantConfig',
              type: 'json',
              label: 'Section 子参数',
            },
          ],
        },
        { name: 'finalizeVariantConfig', type: 'json', label: 'Finalize 子参数' },
        {
          name: 'briefDepth',
          type: 'select',
          label: 'Brief 检索深度（覆盖）',
          options: withInherit(briefDepthFieldOptions),
        },
        {
          name: 'articleStrategy',
          type: 'json',
          label: '文章策略 JSON（覆盖）',
        },
        {
          name: 'sectionRetryStrategy',
          type: 'json',
          label: '章节重试 JSON（覆盖）',
        },
      ],
    },
  ],
}
