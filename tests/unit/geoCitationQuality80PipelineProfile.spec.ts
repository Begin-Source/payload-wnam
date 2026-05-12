import { describe, expect, it } from 'vitest'

import {
  getGeoCitationQuality80PipelineProfileFields,
  SEO_PIPELINE_GEO_CITATION_QUALITY_80_SLUG,
} from '@/migrations/20260514_120000_seed_geo_citation_quality_80_pipeline_profile'

describe('geo citation quality 80 pipeline profile', () => {
  it('defines a standalone GEO citation profile with an 80+ publish gate', () => {
    const profile = getGeoCitationQuality80PipelineProfileFields(false) as {
      slug?: string
      briefDepth?: string
      skeletonVariant?: string
      finalizeVariant?: string
      amzKeywordEligibility?: { intentWhitelist?: string[]; maxKd?: number }
      articleStrategy?: {
        seoWorkflow?: {
          workflowMode?: string
          minQualityScore?: number
          minOnPageWords?: number
          minH2Count?: number
          minH3Count?: number
          contentArchetypes?: string[]
          requireMethodSection?: boolean
        }
        contentQualityGate?: {
          minOverallScore?: number
          minWords?: number
          minH2Count?: number
          minH3Count?: number
          publishIfPass?: boolean
        }
      }
    }

    expect(SEO_PIPELINE_GEO_CITATION_QUALITY_80_SLUG).toBe('geo-citation-quality-80-v1')
    expect(profile.slug).toBe(SEO_PIPELINE_GEO_CITATION_QUALITY_80_SLUG)
    expect(profile.briefDepth).toBe('deep')
    expect(profile.skeletonVariant).toBe('cluster_driven')
    expect(profile.finalizeVariant).toBe('fact_check_pass')
    expect(profile.amzKeywordEligibility?.intentWhitelist).toEqual(['informational', 'commercial'])
    expect(profile.amzKeywordEligibility?.maxKd).toBe(42)
    expect(profile.articleStrategy?.seoWorkflow?.workflowMode).toBe('geo_citation_quality_80')
    expect(profile.articleStrategy?.seoWorkflow?.contentArchetypes).toContain('pillar')
    expect(profile.articleStrategy?.seoWorkflow?.requireMethodSection).toBe(true)
    expect(profile.articleStrategy?.seoWorkflow?.minQualityScore).toBe(80)
    expect(profile.articleStrategy?.seoWorkflow?.minOnPageWords).toBe(2200)
    expect(profile.articleStrategy?.seoWorkflow?.minH2Count).toBe(9)
    expect(profile.articleStrategy?.seoWorkflow?.minH3Count).toBe(5)
    expect(profile.articleStrategy?.contentQualityGate?.minOverallScore).toBe(80)
    expect(profile.articleStrategy?.contentQualityGate?.minWords).toBe(2200)
    expect(profile.articleStrategy?.contentQualityGate?.minH2Count).toBe(9)
    expect(profile.articleStrategy?.contentQualityGate?.minH3Count).toBe(5)
    expect(profile.articleStrategy?.contentQualityGate?.publishIfPass).toBe(true)
  })
})
