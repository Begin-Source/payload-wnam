import { describe, expect, it, vi } from 'vitest'

import {
  isComparisonDecisionTerm,
  isHighCommissionAffiliateTerm,
  parseKeywordBatchMode,
  loadKeywordBatchCandidates,
} from '@/utilities/keywordBatchModes'
import type { Payload } from 'payload'
import { affiliateSeoFlowForMode } from '@/utilities/affiliateSeoFlow'

describe('keywordBatchModes', () => {
  it('parseKeywordBatchMode accepts new modes', () => {
    expect(parseKeywordBatchMode('geo_friendly')).toBe('geo_friendly')
    expect(parseKeywordBatchMode('high_commission_affiliate')).toBe('high_commission_affiliate')
    expect(parseKeywordBatchMode('comparison_decision')).toBe('comparison_decision')
    expect(parseKeywordBatchMode('pillar_sprint')).toBe('pillar_sprint')
    expect(parseKeywordBatchMode('seasonal')).toBe('seasonal')
    expect(parseKeywordBatchMode('refresh_decay')).toBe('refresh_decay')
  })

  it('parseKeywordBatchMode falls back to default for unknown', () => {
    expect(parseKeywordBatchMode('nope')).toBe('default')
    expect(parseKeywordBatchMode('')).toBe('default')
  })

  it('parseKeywordBatchMode keeps default and quick_wins', () => {
    expect(parseKeywordBatchMode('default')).toBe('default')
    expect(parseKeywordBatchMode('quick_wins')).toBe('quick_wins')
  })

  it('matches affiliate-specific term patterns', () => {
    expect(isHighCommissionAffiliateTerm('best robot vacuum for pet hair')).toBe(true)
    expect(isHighCommissionAffiliateTerm('how to clean a keyboard')).toBe(false)
    expect(isComparisonDecisionTerm('air purifier vs dehumidifier')).toBe(true)
    expect(isComparisonDecisionTerm('best coffee maker under 100')).toBe(true)
    expect(isComparisonDecisionTerm('coffee maker maintenance schedule')).toBe(false)
  })

  it('maps affiliate keyword strategies to article flow', () => {
    expect(affiliateSeoFlowForMode('quick_wins')).toMatchObject({
      contentRole: 'money_page',
      articleLayout: 'commercial_hub',
      recommendedPipeline: 'publish-quality-80-v1',
    })
    expect(affiliateSeoFlowForMode('comparison_decision')).toMatchObject({
      contentRole: 'money_page',
      articleLayout: 'product_comparison',
    })
    expect(affiliateSeoFlowForMode('geo_friendly')).toMatchObject({
      contentRole: 'support_page',
      recommendedPipeline: 'geo-citation-quality-80-v1',
    })
  })
})

it('returns seasonal keyword documents with IDs in priority order', async () => {
  const now = new Date()
  const trend = [0, 1, 2].map(offset => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    return { year: date.getFullYear(), month: date.getMonth() + 1, search_volume: 100 }
  })
  const find = vi.fn().mockResolvedValue({ docs: [
    { id: 1, keyword: 'lower priority', opportunityScore: 10, trend },
    { id: 2, keyword: 'higher priority', opportunityScore: 80, trend },
  ] })
  const result = await loadKeywordBatchCandidates({ find } as unknown as Payload, 9, 'seasonal', {}, 20)
  expect(result.rows.map(row => row.id)).toEqual([2, 1])
  expect(result.rows[0]).toMatchObject({ keyword: 'higher priority', seasonalScore: 1 })
})
