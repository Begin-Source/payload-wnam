import type { GlobalConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { financeOnlyBlocksGlobal } from '@/utilities/financeRoleAccess'
import { announcementsPortalBlocksGlobal } from '@/utilities/userAccessTiers'
import { isSystemConfigNavVisible } from '@/utilities/isSuperAdminLikeUser'
import { superAdminPasses } from '@/utilities/superAdminPasses'

const defaultEeatWeights = [
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

const defaultLlmBySection = [
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
      defaultValue: defaultEeatWeights,
      admin: { description: 'Per contentType 8-dimension weights (C,O,R,E,Exp,Ept,A,T) sum=100' },
    },
    {
      name: 'llmModelsBySection',
      type: 'json',
      defaultValue: defaultLlmBySection,
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
  ],
}
