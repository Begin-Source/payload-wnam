import {
  pipelineSettingsDefaultEeatWeights,
  pipelineSettingsDefaultLlmBySection,
} from '@/globals/PipelineSettings'

export const SEO_THEORY_GROWTH_SLUG = 'growth-commercial'
export const SEO_THEORY_QUALITY_SLUG = 'quality-constrained'

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
        model: 'openai/gpt-4o',
        fallbackModel: 'anthropic/claude-3.5-sonnet',
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
    defaultLlmModel: 'openai/gpt-4o-mini',
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

export function getSeoTheoryQualityPipelineProfileFields(): Record<string, unknown> {
  return {
    name: 'SEO 预设 · 稳健（质量门槛）',
    slug: SEO_THEORY_QUALITY_SLUG,
    description:
      'SEO skill 理论：收紧体量/KD/机会分；重章节用 GPT-4o 主模型；提高 section 重试；EEAT 抬高 review/comparison 的体验与专业度。',
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
  }
}
