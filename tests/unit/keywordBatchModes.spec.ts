import { describe, expect, it } from 'vitest'

import {
  isComparisonDecisionTerm,
  isHighCommissionAffiliateTerm,
  parseKeywordBatchMode,
} from '@/utilities/keywordBatchModes'
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
