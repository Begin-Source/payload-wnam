import { describe, expect, it } from 'vitest'

import { planArticleTriage, rankDelta } from '@/utilities/articleLifecycleTriage'
import { needsMoneyPageReinforce } from '@/utilities/moneyPageLinkRules'

describe('needsMoneyPageReinforce', () => {
  const now = new Date('2026-06-01T12:00:00.000Z')

  it('should trigger for old review with few inlinks', () => {
    expect(
      needsMoneyPageReinforce({
        contentTemplate: 'review',
        publishedAt: '2026-05-01T00:00:00.000Z',
        lifecycleStage: 'winner',
        bodyInlinkCount: 2,
        now,
      }),
    ).toBe(true)
  })

  it('should not trigger within 14 days of publish', () => {
    expect(
      needsMoneyPageReinforce({
        contentTemplate: 'review',
        publishedAt: '2026-05-25T00:00:00.000Z',
        lifecycleStage: 'winner',
        bodyInlinkCount: 0,
        now,
      }),
    ).toBe(false)
  })

  it('should not trigger when inlinks enough', () => {
    expect(
      needsMoneyPageReinforce({
        contentTemplate: 'buyingGuide',
        publishedAt: '2026-01-01T00:00:00.000Z',
        lifecycleStage: 'probation',
        bodyInlinkCount: 6,
        now,
      }),
    ).toBe(false)
  })
})

describe('rankDelta', () => {
  it('should be positive when position worsens', () => {
    expect(rankDelta(5, 8)).toBe(3)
  })
  it('should return null when either side missing', () => {
    expect(rankDelta(null, 3)).toBeNull()
  })
})

describe('planArticleTriage', () => {
  it('should move to borderline when off first page', () => {
    const r = planArticleTriage({
      currentStage: 'winner',
      prevPosition: 5,
      newPosition: 12,
      bestPosition: 3,
      stableDays: 0,
      hasMergeTarget: false,
      isAiOverviewHit: false,
      clicks30d: 10,
      impressions30d: 1000,
    })
    expect(r.nextStage).toBe('borderline')
    expect(r.jobs.some((j) => j.jobType === 'content_audit')).toBe(true)
    expect(r.persistHistory).toBe(true)
  })

  it('should enqueue merge when dying and merge target exists', () => {
    const r = planArticleTriage({
      currentStage: 'borderline',
      prevPosition: 28,
      newPosition: 35,
      bestPosition: 10,
      stableDays: 0,
      hasMergeTarget: true,
      isAiOverviewHit: false,
      clicks30d: 0,
      impressions30d: 0,
    })
    expect(r.nextStage).toBe('dying')
    expect(r.jobs[0]?.jobType).toBe('content_merge')
  })

  it('should enqueue archive when dying and no merge target', () => {
    const r = planArticleTriage({
      currentStage: 'winner',
      prevPosition: 31,
      newPosition: 40,
      bestPosition: 8,
      stableDays: 0,
      hasMergeTarget: false,
      isAiOverviewHit: false,
      clicks30d: 0,
      impressions30d: 0,
    })
    expect(r.nextStage).toBe('dying')
    expect(r.jobs[0]?.jobType).toBe('content_archive')
  })

  it('should schedule audit and refresh on rank drop 5–10 on first page', () => {
    const r = planArticleTriage({
      currentStage: 'winner',
      prevPosition: 4,
      newPosition: 10,
      bestPosition: 2,
      stableDays: 0,
      hasMergeTarget: false,
      isAiOverviewHit: false,
      clicks30d: 5,
      impressions30d: 500,
    })
    expect(r.jobs.map((j) => j.jobType).sort()).toEqual(['content_audit', 'content_refresh'].sort())
  })

  it('should not persist history on noop', () => {
    const r = planArticleTriage({
      currentStage: 'winner',
      prevPosition: 5,
      newPosition: 6,
      bestPosition: 3,
      stableDays: 0,
      hasMergeTarget: false,
      isAiOverviewHit: false,
      clicks30d: 20,
      impressions30d: 800,
    })
    expect(r.jobs.length).toBe(0)
    expect(r.persistHistory).toBe(false)
  })

  it('should enqueue meta A/B when first-page band has very low CTR', () => {
    const r = planArticleTriage({
      currentStage: 'winner',
      prevPosition: 4,
      newPosition: 5,
      bestPosition: 3,
      stableDays: 0,
      hasMergeTarget: false,
      isAiOverviewHit: false,
      clicks30d: 1,
      impressions30d: 1000,
    })
    expect(r.jobs.some((j) => j.jobType === 'meta_ab_optimize')).toBe(true)
    expect(r.persistHistory).toBe(true)
  })
})
