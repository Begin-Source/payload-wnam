import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'
import { tenantPromptTemplateKeyOptions } from '@/utilities/domainGeneration/promptKeys'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantIdsForUser, tenantIdFromRelation } from '@/utilities/tenantScope'
import { userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

const promptBodyDescription = [
  '支持占位符（字面替换，未列出则保留原文）：',
  '域名流程 受众 User：`{{main_product}}` `{{site_name}}` `{{niche}}` `{{existing_target_audience}}`',
  '域名流程 域名 User：另含 `{{selected_target_audience}}` `{{audience_candidates}}` `{{current_site_domain}}`',
  '分类槽位 User：`{{rows_json}}`（由系统注入站点行 JSON，勿删占位符）。',
  '信任页包 User：`{{site_name}}` `{{site_domain}}` `{{main_product}}` `{{niche_json}}`（`niche_json` 与站点 nicheData 序列化一致，可为 `{}`）。',
  'SERP 简报 System：`{{memory_block}}` `{{serp_brief_addon}}`；User：`{{term}}` `{{serp_user_block}}` `{{tavily_slice}}`。',
  '草稿章节 User：`{{section_id}}` `{{section_type}}` `{{previous_section_block}}` `{{global_context}}`。',
  '域名审计 User：`{{page_url}}` `{{html_excerpt}}`；告警评估 User：`{{metrics_json}}`；竞品缺口 User：`{{topic}}` `{{competitor_urls}}`（后三者为 pipeline 调用时可传 `tenantId`/`siteId`）。',
  'Offer 评测 MDX User：`{{template_mdx}}` `{{date}}` `{{raw_product_title}}` `{{asin}}` `{{brand}}` `{{category}}` `{{rating}}` `{{image}}` `{{amazon_url}}` `{{key_features}}`。',
  'AMZ 设计 merge User：`{{main_product}}` `{{canonical_site_name}}` `{{canonical_site_domain}}` `{{niche_json}}` `{{current_config_json}}`；fill User 另含 `{{variation_seed}}` `{{dot_paths_block}}` `{{skeleton_json}}`。',
  'Together 生图 `together_site_logo_prompt`：`{{site_quoted}}` `{{key_part}}` `{{brand_line}}` `{{mp_line}}`。',
  'Together `together_hero_banner_prompt`：`{{site_quoted}}` `{{hero_key_part}}` `{{mp_suffix}}` `{{niche_suffix}}`；`together_hero_banner_negative` 多为静态词表（可无占位符）。',
  'Together `together_category_cover_prompt`：`{{category_name}}` `{{slug_suffix}}` `{{desc_chunk}}` `{{site_chunk}}`。',
  'Together `together_article_featured_image_prompt`：`{{title}}` `{{tail}}`。',
  '修改生图模板若破坏构图/禁字约束，由运营自担；未配置租户模板时与代码默认一致。',
  'domain_audit / alert_eval / competitor_gap / draft_section 的 System 未配置租户正文时使用内置 skill 默认；一旦配置模板则以模板为准（可与 skill 源码漂移）。',
  '受众须输出严格 JSON：`{"audiences":["..."]}`；域名 `{"items":[...]}`；分类槽位 `{"rows":[...]}`；信任页包须产出 about/contact/privacy/terms/disclosure 五段 Markdown（见 System）— 详见各流程与解析器约定。',
].join('\n')

const ensureUniqueTenantPromptKey: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const merged = {
    ...(originalDoc as Record<string, unknown> | undefined),
    ...(data as Record<string, unknown>),
  }
  const tenantId = tenantIdFromRelation(
    merged.tenant as number | { id: number } | null | undefined,
  )
  const key = merged.key as string | undefined
  if (tenantId == null || !key) return data

  const { docs } = await req.payload.find({
    collection: 'tenant-prompt-templates',
    where: {
      and: [{ tenant: { equals: tenantId } }, { key: { equals: key } }],
    },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })

  const selfId = originalDoc?.id
  for (const d of docs) {
    if (selfId != null && d.id === selfId) continue
    throw new Error(`该租户下已存在键「${key}」的模板，请编辑现有记录。`)
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
  const tenantId = tenantIdFromRelation(
    merged.tenant as number | { id: number } | null | undefined,
  )
  if (tenantId == null) return data
  const allowed = getTenantIdsForUser(user)
  if (!allowed.includes(tenantId)) {
    throw new Error('无权为该租户创建或修改提示词模板。')
  }
  return data
}

export const TenantPromptTemplates: CollectionConfig = {
  slug: 'tenant-prompt-templates',
  labels: { singular: '租户提示词模板', plural: '租户提示词模板' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'key',
    defaultColumns: ['key', 'tenant', 'updatedAt'],
    description:
      '按租户覆盖 OpenRouter 与 Together 生图提示词：域名生成、分类槽位短名、信任页包、SERP 简报、草稿章节、审计/告警/竞品 pipeline、Offer 评测 MDX、AMZ 模板设计、站点 Logo/Hero/分类封面/Featured 配图；未建记录时使用代码默认。',
  },
  access: loggedInSuperAdminAccessFor('tenant-prompt-templates'),
  hooks: {
    beforeValidate: [ensureUniqueTenantPromptKey],
    beforeChange: [enforceAssignedTenantOnly],
  },
  fields: [
    {
      name: 'key',
      type: 'select',
      required: true,
      index: true,
      options: tenantPromptTemplateKeyOptions,
      admin: {
        description: [
          '域名四段、分类槽位两段、信任页包两段，OpenRouter：serp_brief_*、draft_section_*、domain_audit_*、alert_eval_*、competitor_gap_*、offer_review_mdx_*、amz_template_design_*（merge/fill 各 system+user），及 Together：together_* 生图键。详见下方 body 说明。',
        ].join(''),
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      admin: {
        description: promptBodyDescription,
        rows: 18,
      },
    },
  ],
}
