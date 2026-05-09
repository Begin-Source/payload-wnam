import { describe, expect, it } from 'vitest'

import {
  MAX_WRITING_SCOPE_LABEL_IDS,
  parseCommaSeparatedPositiveInts,
} from '@/utilities/writingScopeLabelQuery'

describe('writingScopeLabelQuery', () => {
  it('parses comma-separated ids with dedupe and sort order unspecified (Set iteration)', () => {
    expect(parseCommaSeparatedPositiveInts('3,1,3,2')).toEqual([1, 2, 3])
  })

  it('rejects non-numeric tokens and empty', () => {
    expect(parseCommaSeparatedPositiveInts('1,a,2')).toEqual([1, 2])
    expect(parseCommaSeparatedPositiveInts(null)).toEqual([])
    expect(parseCommaSeparatedPositiveInts('')).toEqual([])
  })

  it('caps at max', () => {
    const many = Array.from({ length: MAX_WRITING_SCOPE_LABEL_IDS + 5 }, (_, i) => i + 1).join(',')
    expect(parseCommaSeparatedPositiveInts(many).length).toBe(MAX_WRITING_SCOPE_LABEL_IDS)
  })
})
