import { describe, expect, it } from 'vitest'

import { makeCategoryCoverImagePrompt } from '@/utilities/categoryCoverMedia'

describe('categoryCoverMedia', () => {
  it('respects explicit override prompt', () => {
    expect(
      makeCategoryCoverImagePrompt({
        categoryName: 'Ignored',
        slug: 'ignored',
        description: null,
        override: 'Square icon of a dolphin',
      }),
    ).toBe('Square icon of a dolphin')
  })

  it('includes slug and hints in composed prompt', () => {
    const p = makeCategoryCoverImagePrompt({
      categoryName: 'Jump Rope',
      slug: 'jump-rope',
      description: 'Cardio essentials',
      siteName: 'Yoga Store',
    })
    expect(p.toLowerCase()).toContain('jump rope')
    expect(p.toLowerCase()).toContain('jump-rope')
    expect(p).toContain('Cardio essentials')
    expect(p).toContain('Yoga Store')
  })
})
