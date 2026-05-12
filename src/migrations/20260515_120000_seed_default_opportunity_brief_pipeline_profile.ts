import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import {
  pipelineSettingsDefaultEeatWeights,
  pipelineSettingsDefaultLlmBySection,
} from '@/globals/PipelineSettings'
import {
  PIPELINE_DEFAULT_OPENROUTER_LLM,
  PIPELINE_FALLBACK_OPENROUTER_LLM,
} from '@/constants/pipelineOpenRouterModels'

export const SEO_PIPELINE_DEFAULT_OPPORTUNITY_BRIEF_SLUG = 'default-opportunity-brief-v1'

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getDefaultOpportunityBriefPipelineProfileFields(isDefault: boolean): Record<string, unknown> {
  return {
    name: 'SEO 方案 · 标准 Brief（推荐关键词：默认机会分）',
    slug: SEO_PIPELINE_DEFAULT_OPPORTUNITY_BRIEF_SLUG,
    description:
      '推荐关键词策略：默认机会分（default）。按 active/draft 关键词的 opportunityScore 排序排产，适合通用内容生产、轻量测试和员工不确定选哪套专项方案时使用；标准 brief，single-shot 骨架，顺序章节，基础 finalize。',
    isDefault,
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    defaultLlmModel: PIPELINE_DEFAULT_OPENROUTER_LLM,
    briefDepth: 'standard',
    briefVariant: 'dfs_serp_first',
    skeletonVariant: 'single_shot',
    sectionVariant: 'sequential_context',
    finalizeVariant: 'simple_merge',
    sectionParallelism: 1,
    sectionMaxRetry: 3,
    sectionRetryStrategy: { fallbackModel: PIPELINE_FALLBACK_OPENROUTER_LLM },
    amzKeywordEligibility: {
      intentWhitelist: ['commercial', 'transactional'],
      minVolume: 200,
      maxKd: 60,
      minOpportunityScore: 30,
      pullLimit: 200,
    },
    llmModelsBySection: cloneJson(pipelineSettingsDefaultLlmBySection),
    eeatWeights: cloneJson(pipelineSettingsDefaultEeatWeights),
    articleStrategy: {
      tocEnabled: true,
      seoWorkflow: {
        workflowMode: 'default_opportunity_brief',
        qualityTier: 'standard_publish',
        contentArchetypes: ['review', 'comparison', 'how_to', 'listicle'],
        targetTotalWords: 2200,
        directAnswerLeadWords: 90,
        minSpecificityAnchorsPerSection: 3,
        requireMethodSection: true,
        editorNotes:
          'General-purpose SEO brief pipeline: prioritize the highest opportunityScore keywords, keep structure clean, avoid duplicated H2 intents, include practical examples and honest source-backed claims.',
      },
      wordCountTarget: {
        intro: { min: 120, max: 220 },
        body: { min: 350, max: 800 },
        comparison: { min: 300, max: 720 },
        how_to: { min: 320, max: 720 },
        hands_on_test: { min: 260, max: 620 },
        faq: { min: 200, max: 380 },
        conclusion: { min: 80, max: 150 },
      },
    },
  }
}

/**
 * Seeds one standard brief pipeline profile per tenant for the default opportunity-score keyword preset.
 * Idempotent: skips when `default-opportunity-brief-v1` already exists for that tenant.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_profiles'`,
  )
  if (!tableCheck?.c) return

  let page = 1
  const limit = 100
  let hasMore = true

  while (hasMore) {
    const res = await payload.find({
      collection: 'tenants',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
      req,
    })

    for (const tenant of res.docs) {
      const tenantId = tenant.id
      if (typeof tenantId !== 'number') continue

      const existing = await payload.find({
        collection: 'pipeline-profiles',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { slug: { equals: SEO_PIPELINE_DEFAULT_OPPORTUNITY_BRIEF_SLUG } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (existing.docs.length > 0) continue

      const profile = await payload.create({
        collection: 'pipeline-profiles',
        data: {
          tenant: tenantId,
          ...getDefaultOpportunityBriefPipelineProfileFields(true),
        },
        overrideAccess: true,
        req,
      })

      const keywordPreset = await payload.find({
        collection: 'keyword-batch-presets',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { slug: { equals: 'default' } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })

      const defaultPreset = keywordPreset.docs[0] as { id?: number | string } | undefined
      if (defaultPreset?.id != null) {
        await payload.update({
          collection: 'keyword-batch-presets',
          id: defaultPreset.id,
          data: {
            name: '默认机会分（推荐：标准Brief）',
            description:
              '推荐配对 SEO 流水线：标准 Brief。active 优先、无 active 则 draft，按 opportunityScore 降序排产，适合通用内容生产和轻量测试。',
            batchMode: 'default',
          },
          overrideAccess: true,
          req,
        })
      }

      const templates = await payload.find({
        collection: 'tenant-prompt-templates',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { pipelineProfile: { equals: null } },
          ],
        },
        limit: 200,
        depth: 0,
        overrideAccess: true,
        req,
      })

      for (const tpl of templates.docs as Array<{ key?: string; body?: string }>) {
        if (!tpl.key || !tpl.body) continue
        await payload.create({
          collection: 'tenant-prompt-templates',
          data: {
            tenant: tenantId,
            pipelineProfile: profile.id,
            key: tpl.key,
            body: tpl.body,
          },
          overrideAccess: true,
          req,
        })
      }
    }

    hasMore = res.hasNextPage === true
    page += 1
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260515_120000_seed_default_opportunity_brief_pipeline_profile is irreversible; delete rows in Admin if needed.',
  )
}
