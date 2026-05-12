import { describe, expect, it } from 'vitest'

import {
  normalizeSeoKeyword,
  pickSeoTitle,
  writeSeoTitleCandidates,
} from '@/utilities/seoTitleWriter'

describe('seoTitleWriter', () => {
  it('normalizes keyword input from slugs and punctuation', () => {
    expect(normalizeSeoKeyword({ keyword: 'fitness-mat!!' })).toBe('fitness mat')
  })

  it('writes three SEO title candidates with keyword-front options and descriptions', () => {
    const variants = writeSeoTitleCandidates({ keyword: 'fitness mat', year: 2026 })
    expect(variants).toHaveLength(3)
    expect(variants[0]?.title.toLowerCase()).toContain('fitness mat')
    expect(variants.every((v) => v.title.length <= 60)).toBe(true)
    expect(variants.every((v) => v.description.toLowerCase().includes('fitness mat'))).toBe(true)
  })

  it('picks a title suitable for SERP display', () => {
    const best = pickSeoTitle({ keyword: 'fitness mat', year: 2026 })
    expect(best.title.toLowerCase()).toContain('fitness mat')
    expect(best.title.length).toBeGreaterThanOrEqual(42)
    expect(best.title.length).toBeLessThanOrEqual(60)
  })
})
