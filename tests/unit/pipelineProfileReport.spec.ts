import { describe, expect, it } from 'vitest'

import { workflowJobMatchesProfile } from '@/utilities/pipelineProfileReport'

describe('pipelineProfileReport', () => {
  it('matches slug tag', () => {
    expect(workflowJobMatchesProfile({ pipelineProfileSlug: 'seo-a' }, 'seo-a', 9)).toBe(true)
    expect(workflowJobMatchesProfile({ pipelineProfileSlug: 'other' }, 'seo-a', 9)).toBe(false)
  })
  it('matches profile id fallback', () => {
    expect(workflowJobMatchesProfile({ pipelineProfileId: 42 }, '', 42)).toBe(true)
    expect(workflowJobMatchesProfile({ pipelineProfileId: '42' }, '', 42)).toBe(true)
  })
})
