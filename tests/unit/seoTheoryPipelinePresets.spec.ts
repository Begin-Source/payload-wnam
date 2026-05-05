import { describe, expect, it } from 'vitest'

import { loadAmzEligibilityThresholdsFromMerged } from '@/utilities/keywordEligibility'
import { mergePipelineProfileOntoGlobal, normalizeGlobalPipelineDoc } from '@/utilities/pipelineSettingShape'
import {
  getSeoTheoryGrowthPipelineProfileFields,
  getSeoTheoryQualityPipelineProfileFields,
  SEO_THEORY_GROWTH_SLUG,
  SEO_THEORY_QUALITY_SLUG,
} from '@/utilities/seoTheoryPipelineProfilePresets'

describe('seo theory pipeline profile presets', () => {
  it('exposes stable slugs', () => {
    expect(SEO_THEORY_GROWTH_SLUG).toBe('growth-commercial')
    expect(SEO_THEORY_QUALITY_SLUG).toBe('quality-constrained')
  })

  it('growth preset widens AMZ thresholds vs tight quality preset', () => {
    const g = getSeoTheoryGrowthPipelineProfileFields(false) as { amzKeywordEligibility: Record<string, unknown> }
    const q = getSeoTheoryQualityPipelineProfileFields() as { amzKeywordEligibility: Record<string, unknown> }
    expect(g.amzKeywordEligibility.minVolume).toBe(150)
    expect(q.amzKeywordEligibility.minVolume).toBe(300)
    expect(g.amzKeywordEligibility.maxKd).toBe(65)
    expect(q.amzKeywordEligibility.maxKd).toBe(45)
  })

  it('quality preset raises sectionMaxRetry', () => {
    const q = getSeoTheoryQualityPipelineProfileFields() as { sectionMaxRetry: number }
    expect(q.sectionMaxRetry).toBe(4)
  })

  it('merged growth eligibility flows through loadAmzEligibilityThresholdsFromMerged', () => {
    const base = normalizeGlobalPipelineDoc({
      amzKeywordEligibility: { minVolume: 200, maxKd: 60 },
    })
    const growth = getSeoTheoryGrowthPipelineProfileFields(false) as Record<string, unknown>
    const merged = mergePipelineProfileOntoGlobal(base, growth)
    const t = loadAmzEligibilityThresholdsFromMerged(merged)
    expect(t.minVolume).toBe(150)
    expect(t.maxKd).toBe(65)
  })

  it('quality LLM preset swaps primary model for heavy sections', () => {
    const q = getSeoTheoryQualityPipelineProfileFields() as {
      llmModelsBySection: Array<{ sectionType?: string; model?: string }>
    }
    const how = q.llmModelsBySection.find((r) => r.sectionType === 'how_to')
    expect(how?.model).toBe('openai/gpt-4o')
  })
})
