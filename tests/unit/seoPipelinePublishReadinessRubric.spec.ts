import { describe, expect, it } from 'vitest'

import { scorePipelineProfilePublishReadiness } from '@/utilities/seoPipelinePublishReadinessRubric'
import {
  getSeoPublishAuthorityFirstProfileFields,
  getSeoPublishQuality80ProfileFields,
  getSeoScaleFreshnessProfileFields,
  getSeoTheoryGrowthPipelineProfileFields,
} from '@/utilities/seoTheoryPipelineProfilePresets'

describe('scorePipelineProfilePublishReadiness', () => {
  it('scores authority-first and scale-freshness presets at least 80/100', () => {
    const a = scorePipelineProfilePublishReadiness(getSeoPublishAuthorityFirstProfileFields(false))
    const b = scorePipelineProfilePublishReadiness(getSeoScaleFreshnessProfileFields(false))

    expect(a.hardBlocked).toBe(false)
    expect(b.hardBlocked).toBe(false)
    expect(a.overall).toBeGreaterThanOrEqual(80)
    expect(b.overall).toBeGreaterThanOrEqual(80)
  })

  it('scores publish-quality-80 preset at least 80/100 with no hard block', () => {
    const q = scorePipelineProfilePublishReadiness(getSeoPublishQuality80ProfileFields(false))
    expect(q.hardBlocked).toBe(false)
    expect(q.overall).toBeGreaterThanOrEqual(80)
  })

  it('marks growth preset as not publish-ready when finalize inherits simple_merge', () => {
    const g = scorePipelineProfilePublishReadiness(getSeoTheoryGrowthPipelineProfileFields(false))
    expect(g.hardBlocked).toBe(true)
    expect(g.overall).toBeLessThan(80)
  })
})
