import { describe, expect, it } from 'vitest'

import {
  buildLexicalSkeleton,
  sectionSkeletonPlaceholderStillPresent,
} from '@/services/writing/skeletonBuilder'

describe('skeletonBuilder', () => {
  it('sectionSkeletonPlaceholderStillPresent is true for untouched skeleton', () => {
    const body = buildLexicalSkeleton(['intro', 'faq'])
    expect(sectionSkeletonPlaceholderStillPresent(body, 'intro')).toBe(true)
    expect(sectionSkeletonPlaceholderStillPresent(body, 'faq')).toBe(true)
  })

  it('sectionSkeletonPlaceholderStillPresent is false when section id missing', () => {
    const body = buildLexicalSkeleton(['intro'])
    expect(sectionSkeletonPlaceholderStillPresent(body, 'faq')).toBe(false)
  })
})
