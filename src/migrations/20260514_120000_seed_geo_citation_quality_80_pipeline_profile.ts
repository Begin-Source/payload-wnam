import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import {
  pipelineSettingsDefaultEeatWeights,
  pipelineSettingsDefaultLlmBySection,
} from '@/globals/PipelineSettings'
import {
  PIPELINE_DEFAULT_OPENROUTER_LLM,
  PIPELINE_FALLBACK_OPENROUTER_LLM,
} from '@/constants/pipelineOpenRouterModels'

export const SEO_PIPELINE_GEO_CITATION_QUALITY_80_SLUG = 'geo-citation-quality-80-v1'

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function geoCitationEeatWeights(): typeof pipelineSettingsDefaultEeatWeights {
  const w = cloneJson(pipelineSettingsDefaultEeatWeights)
  const howto = w.find((r) => r.contentType === 'howto')
  if (howto) howto.weights = { ...howto.weights, C: 18, R: 20, Ept: 18 }
  const pillar = w.find((r) => r.contentType === 'pillar')
  if (pillar) pillar.weights = { ...pillar.weights, C: 18, R: 20, Ept: 18 }
  const comparison = w.find((r) => r.contentType === 'comparison')
  if (comparison) comparison.weights = { ...comparison.weights, C: 17, R: 20, Ept: 18 }
  return w
}

function geoCitationLlmBySection(): typeof pipelineSettingsDefaultLlmBySection {
  return pipelineSettingsDefaultLlmBySection.map((row) => {
    if (
      row.sectionType === 'how_to' ||
      row.sectionType === 'comparison' ||
      row.sectionType === 'hands_on_test'
    ) {
      return {
        ...row,
        model: PIPELINE_DEFAULT_OPENROUTER_LLM,
        fallbackModel: PIPELINE_FALLBACK_OPENROUTER_LLM,
      }
    }
    return { ...row }
  })
}

export function getGeoCitationQuality80PipelineProfileFields(isDefault: boolean): Record<string, unknown> {
  return {
    name: 'SEO 方案 · GEO 引用 80+（推荐关键词：GEO 引用选词）',
    slug: SEO_PIPELINE_GEO_CITATION_QUALITY_80_SLUG,
    description:
      '推荐关键词策略：GEO 引用选词（geo-citation-keywords）。信息/商业意图优先，适合 AI Overview / LLM 可引用的答案型权威内容；Deep brief + SERP/Tavily 证据，cluster 骨架，逐章调研，fact-check finalize；content-audit >=80 且无硬 veto 才发布。',
    isDefault,
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    defaultLlmModel: PIPELINE_DEFAULT_OPENROUTER_LLM,
    briefDepth: 'deep',
    briefVariant: 'dfs_serp_first',
    briefVariantConfig: { serpDepth: 10, competitorCount: 6 },
    skeletonVariant: 'cluster_driven',
    sectionVariant: 'research_per_section',
    finalizeVariant: 'fact_check_pass',
    sectionParallelism: 1,
    sectionParallelWhitelist: ['faq'],
    sectionMaxRetry: 4,
    sectionRetryStrategy: { fallbackModel: PIPELINE_FALLBACK_OPENROUTER_LLM },
    amzKeywordEligibility: {
      intentWhitelist: ['informational', 'commercial'],
      minVolume: 250,
      maxKd: 42,
      minOpportunityScore: 38,
      pullLimit: 140,
    },
    llmModelsBySection: geoCitationLlmBySection(),
    eeatWeights: geoCitationEeatWeights(),
    articleStrategy: {
      tocEnabled: true,
      seoWorkflow: {
        workflowMode: 'geo_citation_quality_80',
        qualityTier: 'publish_grade',
        contentArchetypes: ['pillar', 'howto', 'comparison', 'faq'],
        targetTotalWords: 2800,
        minOnPageWords: 2200,
        minH2Count: 9,
        minH3Count: 5,
        requireFaqSection: true,
        requireChecklistSection: true,
        disallowBodyH1: true,
        directAnswerLeadWords: 80,
        minSpecificityAnchorsPerSection: 4,
        minQualityScore: 80,
        hardVetoCodes: ['T04', 'C01', 'R10'],
        requireMethodSection: true,
        editorNotes:
          'Optimize for AI citation: open with a concise direct answer, define entities clearly, include source-backed claims, method/selection criteria, limitations, comparison tables, FAQ, and citation-worthy summary bullets. Do not publish if evidence is thin or claims conflict.',
      },
      contentQualityGate: {
        minOverallScore: 80,
        minWords: 2200,
        minH2Count: 9,
        minH3Count: 5,
        requireFaqSection: true,
        requireChecklistSection: true,
        disallowBodyH1: true,
        publishIfPass: true,
        hardVetoCodes: ['T04', 'C01', 'R10'],
        onFail: 'keep_draft',
      },
      wordCountTarget: {
        intro: { min: 120, max: 220 },
        body: { min: 420, max: 900 },
        comparison: { min: 360, max: 820 },
        how_to: { min: 380, max: 820 },
        hands_on_test: { min: 300, max: 680 },
        faq: { min: 260, max: 460 },
        conclusion: { min: 100, max: 180 },
      },
    },
  }
}

/**
 * Seeds one GEO / AI-citation 80+ quality pipeline profile per tenant.
 * Idempotent: skips when `geo-citation-quality-80-v1` already exists for that tenant.
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
            { slug: { equals: SEO_PIPELINE_GEO_CITATION_QUALITY_80_SLUG } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (existing.docs.length > 0) continue

      await payload.create({
        collection: 'pipeline-profiles',
        data: {
          tenant: tenantId,
          ...getGeoCitationQuality80PipelineProfileFields(false),
        },
        overrideAccess: true,
        req,
      })
    }

    hasMore = res.hasNextPage === true
    page += 1
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260514_120000_seed_geo_citation_quality_80_pipeline_profile is irreversible; delete rows in Admin if needed.',
  )
}
