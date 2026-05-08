import { describe, expect, it } from 'vitest'

import { parseKeywordBatchMode } from '@/utilities/keywordBatchModes'

describe('keywordBatchModes', () => {
  it('parseKeywordBatchMode accepts new modes', () => {
    expect(parseKeywordBatchMode('geo_friendly')).toBe('geo_friendly')
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
})
