import {
  pipelineSettingsDefaultEeatWeights,
  pipelineSettingsDefaultLlmBySection,
} from '@/globals/PipelineSettings'
import {
  PIPELINE_DEFAULT_OPENROUTER_LLM,
  PIPELINE_FALLBACK_OPENROUTER_LLM,
} from '@/constants/pipelineOpenRouterModels'

export const SEO_THEORY_GROWTH_SLUG = 'growth-commercial'
export const SEO_THEORY_QUALITY_SLUG = 'quality-constrained'

/** 方案 A：权威 / EEAT _finalize + 逐章调研 — 适合高客单 review / comparison。 */
export const SEO_PIPELINE_AUTHORITY_FIRST_SLUG = 'publish-authority-eeat-v1'

/** 方案 B：时效 + 并行章节 + 事实核对 — 适合 list / how-to 规模化更新。 */
export const SEO_PIPELINE_SCALE_FRESH_SLUG = 'scale-freshness-parallel-v1'

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

type EeatRow = (typeof pipelineSettingsDefaultEeatWeights)[number]

function growthEeatWeights(): EeatRow[] {
  const w = cloneJson(pipelineSettingsDefaultEeatWeights)
  const review = w.find((r) => r.contentType === 'review')
  if (review) review.weights = { ...review.weights, R: 17, Exp: 22 }
  const listicle = w.find((r) => r.contentType === 'listicle')
  if (listicle) listicle.weights = { ...listicle.weights, R: 17, Exp: 12 }
  return w
}

function qualityEeatWeights(): EeatRow[] {
  const w = cloneJson(pipelineSettingsDefaultEeatWeights)
  const review = w.find((r) => r.contentType === 'review')
  if (review) review.weights = { ...review.weights, Exp: 22, Ept: 18 }
  const comp = w.find((r) => r.contentType === 'comparison')
  if (comp) comp.weights = { ...comp.weights, Exp: 18, Ept: 18 }
  return w
}

function qualityLlmBySection(): typeof pipelineSettingsDefaultLlmBySection {
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

/** Fields for `payload.create('pipeline-profiles')` excluding `tenant` (migration sets it). */
export function getSeoTheoryGrowthPipelineProfileFields(isDefault: boolean): Record<string, unknown> {
  return {
    name: 'SEO 预设 · 增长（联盟导向）',
    slug: SEO_THEORY_GROWTH_SLUG,
    description:
      'SEO skill 理论：新站冲量，commercial/transactional 优先，关键词口袋略宽；Tavily+DFS 开启；EEAT 略抬高 review/listicle 的相关性与体验。',
    isDefault,
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    defaultLlmModel: PIPELINE_DEFAULT_OPENROUTER_LLM,
    amzKeywordEligibility: {
      intentWhitelist: ['commercial', 'transactional'],
      minVolume: 150,
      maxKd: 65,
      minOpportunityScore: 25,
      pullLimit: 250,
    },
    llmModelsBySection: cloneJson(pipelineSettingsDefaultLlmBySection),
    eeatWeights: growthEeatWeights(),
  }
}

/** Default `articleStrategy` for the quality preset — `seoWorkflow` is injected into brief/section/finalize prompts. */
export function qualityPresetDefaultArticleStrategy(): Record<string, unknown> {
  return {
    tocEnabled: true,
    seoWorkflow: {
      workflowMode: 'one_click_publish_grade',
      qualityTier: 'publish_grade',
      contentArchetypes: ['review', 'comparison', 'how_to'],
      targetTotalWords: 2400,
      directAnswerLeadWords: 100,
      minSpecificityAnchorsPerSection: 3,
      requireMethodSection: true,
      editorNotes:
        'Ship one cohesive publish-ready article in a single pipeline run: no filler, no duplicate H2 intents, align every section to the SERP brief, keep disclosure and spec citations honest.',
    },
    wordCountTarget: {
      intro: { min: 140, max: 240 },
      body: { min: 400, max: 900 },
      comparison: { min: 350, max: 800 },
      how_to: { min: 350, max: 750 },
      hands_on_test: { min: 320, max: 700 },
      faq: { min: 220, max: 420 },
      conclusion: { min: 90, max: 160 },
    },
  }
}

export function getSeoTheoryQualityPipelineProfileFields(): Record<string, unknown> {
  return {
    name: 'SEO 预设 · 稳健（质量门槛）',
    slug: SEO_THEORY_QUALITY_SLUG,
    description:
      'SEO skill 理论：收紧体量/KD/机会分；重章节与默认一致用 DeepSeek 主模型；提高 section 重试；EEAT 抬高 review/comparison 的体验与专业度；articleStrategy.seoWorkflow 参数化驱动一键高质量成稿。',
    isDefault: false,
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    sectionMaxRetry: 4,
    amzKeywordEligibility: {
      intentWhitelist: ['commercial', 'transactional'],
      minVolume: 300,
      maxKd: 45,
      minOpportunityScore: 35,
      pullLimit: 120,
    },
    llmModelsBySection: qualityLlmBySection(),
    eeatWeights: qualityEeatWeights(),
    articleStrategy: qualityPresetDefaultArticleStrategy(),
  }
}

/** 发布权威线：深 Brief、SERP top10 skeleton、逐章调研、EEAT finalize、严关键词口袋。 */
export function getSeoPublishAuthorityFirstProfileFields(isDefault: boolean): Record<string, unknown> {
  return {
    name: 'SEO 方案 · 权威优先（EEAT finalize）',
    slug: SEO_PIPELINE_AUTHORITY_FIRST_SLUG,
    description:
      'CORE-EEAT 导向：深检索 + DFS SERP + top10 骨架；逐章带调研上下文；finalize 走 EEAT 重写；关键词体量/KD/机会分收紧；适合高信任转化页。',
    isDefault,
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    defaultLlmModel: PIPELINE_DEFAULT_OPENROUTER_LLM,
    briefDepth: 'deep',
    briefVariant: 'dfs_serp_first',
    skeletonVariant: 'top10_blend',
    sectionVariant: 'research_per_section',
    finalizeVariant: 'eeat_rewrite_pass',
    sectionMaxRetry: 4,
    sectionParallelism: 1,
    amzKeywordEligibility: {
      intentWhitelist: ['commercial', 'transactional'],
      minVolume: 400,
      maxKd: 38,
      minOpportunityScore: 42,
      pullLimit: 100,
    },
    llmModelsBySection: qualityLlmBySection(),
    eeatWeights: qualityEeatWeights(),
    articleStrategy: {
      ...qualityPresetDefaultArticleStrategy(),
      seoWorkflow: {
        ...(qualityPresetDefaultArticleStrategy().seoWorkflow as Record<string, unknown>),
        workflowMode: 'authority_first_publish',
        targetTotalWords: 2600,
        minSpecificityAnchorsPerSection: 4,
        editorNotes:
          'Prioritize demonstrable expertise: primary sources, spec tables, limitation callouts, and one consolidated disclosure block; avoid thin roundup blurbs.',
      },
    },
  }
}

/** 规模化新鲜度线：标准 Brief、cluster 骨架、并行章节、fact-check finalize、略宽词袋 + 并行度。 */
export function getSeoScaleFreshnessProfileFields(isDefault: boolean): Record<string, unknown> {
  return {
    name: 'SEO 方案 · 时效规模化（并行 + fact-check）',
    slug: SEO_PIPELINE_SCALE_FRESH_SLUG,
    description:
      '在仍开启 Tavily+DFS 的前提下，用 cluster 骨架与并行章节换吞吐；finalize 走事实核对；词袋略宽以覆盖趋势词；适合 how-to / listicle 矩阵。',
    isDefault,
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    defaultLlmModel: PIPELINE_DEFAULT_OPENROUTER_LLM,
    briefDepth: 'standard',
    briefVariant: 'dfs_serp_first',
    skeletonVariant: 'cluster_driven',
    sectionVariant: 'parallel_with_summary',
    finalizeVariant: 'fact_check_pass',
    sectionParallelism: 3,
    sectionMaxRetry: 3,
    amzKeywordEligibility: {
      intentWhitelist: ['informational', 'commercial', 'transactional'],
      minVolume: 220,
      maxKd: 52,
      minOpportunityScore: 28,
      pullLimit: 200,
    },
    llmModelsBySection: cloneJson(pipelineSettingsDefaultLlmBySection),
    eeatWeights: (() => {
      const w = cloneJson(pipelineSettingsDefaultEeatWeights)
      const howto = w.find((r) => r.contentType === 'howto')
      if (howto) howto.weights = { ...howto.weights, O: 22, R: 12 }
      const list = w.find((r) => r.contentType === 'listicle')
      if (list) list.weights = { ...list.weights, O: 22, R: 14 }
      return w
    })(),
    articleStrategy: {
      tocEnabled: true,
      seoWorkflow: {
        workflowMode: 'scale_fresh_matrix',
        qualityTier: 'publish_grade',
        contentArchetypes: ['howto', 'listicle', 'pillar'],
        targetTotalWords: 2400,
        directAnswerLeadWords: 90,
        minSpecificityAnchorsPerSection: 3,
        requireMethodSection: true,
        editorNotes:
          'Optimize for freshness signals: date the research window, cite recent sources in-body, and keep H2s aligned to current SERP sub-intents without fluff.',
      },
      wordCountTarget: {
        intro: { min: 120, max: 200 },
        body: { min: 380, max: 820 },
        comparison: { min: 300, max: 720 },
        how_to: { min: 360, max: 780 },
        hands_on_test: { min: 280, max: 620 },
        faq: { min: 200, max: 380 },
        conclusion: { min: 80, max: 140 },
      },
    },
  }
}
