import { describe, expect, it } from 'vitest'

import {
  getDefaultOpportunityBriefPipelineProfileFields,
  SEO_PIPELINE_DEFAULT_OPPORTUNITY_BRIEF_SLUG,
} from '@/migrations/20260515_120000_seed_default_opportunity_brief_pipeline_profile'

describe('default opportunity brief pipeline profile', () => {
  it('defines a standalone profile for the default opportunity keyword preset', () => {
    const profile = getDefaultOpportunityBriefPipelineProfileFields(false) as {
      slug?: string
      name?: string
      briefDepth?: string
      skeletonVariant?: string
      sectionVariant?: string
      finalizeVariant?: string
      amzKeywordEligibility?: {
        intentWhitelist?: string[]
        minVolume?: number
        maxKd?: number
        minOpportunityScore?: number
      }
      articleStrategy?: {
        seoWorkflow?: {
          workflowMode?: string
          qualityTier?: string
          targetTotalWords?: number
        }
      }
    }

    expect(SEO_PIPELINE_DEFAULT_OPPORTUNITY_BRIEF_SLUG).toBe('default-opportunity-brief-v1')
    expect(profile.slug).toBe(SEO_PIPELINE_DEFAULT_OPPORTUNITY_BRIEF_SLUG)
    expect(profile.name).toContain('默认机会分')
    expect(profile.briefDepth).toBe('standard')
    expect(profile.skeletonVariant).toBe('single_shot')
    expect(profile.sectionVariant).toBe('sequential_context')
    expect(profile.finalizeVariant).toBe('simple_merge')
    expect(profile.amzKeywordEligibility?.intentWhitelist).toEqual(['commercial', 'transactional'])
    expect(profile.amzKeywordEligibility?.minVolume).toBe(200)
    expect(profile.amzKeywordEligibility?.maxKd).toBe(60)
    expect(profile.amzKeywordEligibility?.minOpportunityScore).toBe(30)
    expect(profile.articleStrategy?.seoWorkflow?.workflowMode).toBe('default_opportunity_brief')
    expect(profile.articleStrategy?.seoWorkflow?.qualityTier).toBe('standard_publish')
    expect(profile.articleStrategy?.seoWorkflow?.targetTotalWords).toBe(2200)
  })
})
