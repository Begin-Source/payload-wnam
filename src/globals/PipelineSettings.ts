import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { superAdminPasses } from '@/utilities/superAdminPasses'
import {
  DEFAULT_BRIEF_DEPTH,
  DEFAULT_BRIEF_VARIANT,
  DEFAULT_FINALIZE_VARIANT,
  DEFAULT_SECTION_VARIANT,
  DEFAULT_SKELETON_VARIANT,
  briefDepthFieldOptions,
  briefVariantFieldOptions,
  finalizeVariantFieldOptions,
  sectionVariantFieldOptions,
  skeletonVariantFieldOptions,
} from '@/utilities/pipelineVariants'

/** Defaults mirrored by Admin global `pipeline-settings` JSON fields (used by SEO theory pipeline profile seeds). */
export const pipelineSettingsDefaultEeatWeights = [
  {
    contentType: 'review',
    weights: { C: 10, O: 10, R: 15, E: 15, Exp: 20, Ept: 15, A: 5, T: 10 },
  },
  {
    contentType: 'comparison',
    weights: { C: 10, O: 15, R: 15, E: 15, Exp: 15, Ept: 15, A: 5, T: 10 },
  },
  {
    contentType: 'howto',
    weights: { C: 15, O: 20, R: 10, E: 5, Exp: 15, Ept: 15, A: 10, T: 10 },
  },
  {
    contentType: 'buyingGuide',
    weights: { C: 10, O: 10, R: 15, E: 15, Exp: 15, Ept: 15, A: 10, T: 10 },
  },
  {
    contentType: 'pillar',
    weights: { C: 15, O: 15, R: 15, E: 10, Exp: 10, Ept: 15, A: 10, T: 10 },
  },
  {
    contentType: 'listicle',
    weights: { C: 15, O: 20, R: 15, E: 10, Exp: 10, Ept: 10, A: 10, T: 10 },
  },
  {
    contentType: 'landing',
    weights: { C: 20, O: 15, R: 10, E: 10, Exp: 5, Ept: 10, A: 15, T: 15 },
  },
]

export const pipelineSettingsDefaultLlmBySection = [
  { sectionType: 'intro', model: 'openai/gpt-4o-mini', fallbackModel: 'openai/gpt-4o', maxOutputTokens: 800 },
  { sectionType: 'conclusion', model: 'openai/gpt-4o-mini', fallbackModel: 'openai/gpt-4o', maxOutputTokens: 500 },
  { sectionType: 'faq', model: 'openai/gpt-4o-mini', fallbackModel: 'openai/gpt-4o', maxOutputTokens: 1200 },
  { sectionType: 'pros_cons', model: 'openai/gpt-4o-mini', fallbackModel: 'openai/gpt-4o', maxOutputTokens: 800 },
  { sectionType: 'topic_definition', model: 'openai/gpt-4o-mini', fallbackModel: 'openai/gpt-4o', maxOutputTokens: 1500 },
  {
    sectionType: 'how_to',
    model: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'openai/gpt-4o',
    maxOutputTokens: 2000,
  },
  {
    sectionType: 'comparison',
    model: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'openai/gpt-4o',
    maxOutputTokens: 2000,
  },
  {
    sectionType: 'hands_on_test',
    model: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'openai/gpt-4o',
    maxOutputTokens: 2000,
  },
  { sectionType: 'custom', model: 'openai/gpt-4o', fallbackModel: 'openai/gpt-4o-mini', maxOutputTokens: 2000 },
]

export const PipelineSettings: GlobalConfig = {
  slug: 'pipeline-settings',
  label: 'SEO 流水线',
  admin: {
    group: adminGroups.operations,
    hidden: ({ user }) => !isSystemConfigNavVisible(user),
  },
  access: {
    read: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'pipeline-settings')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'pipeline-settings')) return false
      return superAdminPasses(() => true)(args)
    },
    update: (args) => {
      if (announcementsPortalBlocksGlobal(args.req.user, 'pipeline-settings')) return false
      if (financeOnlyBlocksGlobal(args.req.user, 'pipeline-settings')) return false
      return superAdminPasses(() => true)(args)
    },
  },
  fields: [
    {
      name: 'tavilyEnabled',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'dataForSeoEnabled',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'togetherImageEnabled',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'defaultLlmModel',
      type: 'text',
      defaultValue: 'openai/gpt-4o',
      admin: { description: 'OpenRouter model id' },
    },
    {
      name: 'defaultImageModel',
      type: 'text',
      defaultValue: 'black-forest-labs/FLUX.1-schnell',
    },
    {
      name: 'amazonMarketplace',
      type: 'text',
      defaultValue: 'amazon.com',
    },
    {
      name: 'defaultLocale',
      type: 'text',
      defaultValue: 'en',
    },
    {
      name: 'defaultRegion',
      type: 'text',
      defaultValue: 'US',
    },
    {
      name: 'frugalMode',
      type: 'checkbox',
      defaultValue: false,
      label: '抠门模式',
    },
    {
      name: 'eeatWeights',
      type: 'json',
      defaultValue: pipelineSettingsDefaultEeatWeights,
      admin: { description: 'Per contentType 8-dimension weights (C,O,R,E,Exp,Ept,A,T) sum=100' },
    },
    {
      name: 'llmModelsBySection',
      type: 'json',
      defaultValue: pipelineSettingsDefaultLlmBySection,
    },
    {
      name: 'sectionParallelism',
      type: 'number',
      defaultValue: 1,
    },
    {
      name: 'sectionParallelWhitelist',
      type: 'json',
      defaultValue: ['faq', 'pros_cons'],
    },
    {
      name: 'sectionMaxRetry',
      type: 'number',
      defaultValue: 3,
    },
    {
      name: 'amzKeywordEligibility',
      label: 'AMZ 关键词资格（DFS 同步）',
      type: 'json',
      defaultValue: {
        intentWhitelist: ['commercial', 'transactional'],
        minVolume: 200,
        maxKd: 60,
        minOpportunityScore: 30,
        pullLimit: 200,
      },
      admin: {
        description:
          'Used by Keywords list “同步拉取 · DataForSEO”. intentWhitelist: informational | navigational | commercial | transactional. Drawer can override per request.',
      },
    },
    {
      type: 'collapsible',
      label: '阶段策略 · Brief / Skeleton / Section / Finalize（T2）',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'briefVariant',
          type: 'select',
          label: 'Brief 打法',
          defaultValue: DEFAULT_BRIEF_VARIANT,
          options: briefVariantFieldOptions,
        },
        {
          name: 'briefVariantConfig',
          type: 'json',
          label: 'Brief 打法子参数',
          admin: {
            condition: (_, s) =>
              !!(s?.briefVariant && String(s.briefVariant) === 'competitor_mimic'),
            description: 'competitor_mimic：`{ "competitorCount": 3 }` · dfs：`{ "serpDepth": 10 }`',
          },
        },
        {
          name: 'skeletonVariant',
          type: 'select',
          label: '大纲骨架打法',
          defaultValue: DEFAULT_SKELETON_VARIANT,
          options: skeletonVariantFieldOptions,
        },
        {
          name: 'skeletonVariantConfig',
          type: 'json',
          label: 'Skeleton 子参数',
          admin: {
            description: 'top10_blend / cluster_driven 按需扩展(JSON)，默认可留空。',
          },
        },
        {
          name: 'sectionVariant',
          type: 'select',
          label: '章节写作打法',
          defaultValue: DEFAULT_SECTION_VARIANT,
          options: sectionVariantFieldOptions,
        },
        {
          name: 'sectionVariantConfig',
          type: 'json',
          label: 'Section 子参数',
        },
        {
          name: 'finalizeVariant',
          type: 'select',
          label: 'Finalize 打法',
          defaultValue: DEFAULT_FINALIZE_VARIANT,
          options: finalizeVariantFieldOptions,
        },
        {
          name: 'finalizeVariantConfig',
          type: 'json',
          label: 'Finalize 子参数',
        },
      ],
    },
    {
      name: 'briefDepth',
      type: 'select',
      label: 'Brief / 检索深度',
      defaultValue: DEFAULT_BRIEF_DEPTH,
      options: briefDepthFieldOptions,
      admin: {
        description: '与「抠门模式」可同时使用；勾选抠门仍会强制最便宜模型。',
      },
    },
    {
      name: 'articleStrategy',
      type: 'json',
      label: '文章级策略（TOC / CTA / 字数）',
      defaultValue: {
        tocEnabled: true,
        maxWordsPerSection: null,
      },
      admin: {
        description:
          '例如：`{ "tocEnabled": true, "maxWordsPerSection": 900, "wordCountTarget": { "intro": { "min": 120, "max": 220 } } }`',
      },
    },
    {
      name: 'sectionRetryStrategy',
      type: 'json',
      label: '章节重试策略',
      defaultValue: { fallbackModel: 'openai/gpt-4o-mini' },
      admin: {
        description: '`{ "fallbackModel": "openai/gpt-4o-mini" }`，末次失败后切换模型。',
      },
    },
  ],
}
