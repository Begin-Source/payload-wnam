import { describe, expect, it } from 'vitest'

import { resolveMediaAiImagePrompt, truncateErrorMessage } from '@/utilities/mediaAiImagePrompt'

describe('mediaAiImagePrompt', () => {
  it('skips when aiImagePrompt and alt are empty', () => {
    const r = resolveMediaAiImagePrompt({ aiImagePrompt: '', alt: '' })
    expect(r.skipped).toBe(true)
    if (r.skipped) expect(r.skipReason).toBe('empty_image_prompt_and_title')
  })

  it('uses image_prompt when plain text', () => {
    const r = resolveMediaAiImagePrompt({ aiImagePrompt: 'A serene mountain lake at dawn', alt: 'Lake' })
    expect(r.skipped).toBe(false)
    if (!r.skipped) {
      expect(r.promptText).toBe('A serene mountain lake at dawn')
      expect(r.source).toBe('image_prompt')
    }
  })

  it('falls back from URL-like prompt to alt-based title line', () => {
    const r = resolveMediaAiImagePrompt({
      aiImagePrompt: 'https://cdn.example.com/old.png',
      alt: 'Best USB hub 2026',
    })
    expect(r.skipped).toBe(false)
    if (!r.skipped) {
      expect(r.promptText).toBe('thumbnail image for this blog title: Best USB hub 2026')
      expect(r.source).toBe('title_fallback_from_url_prompt')
    }
  })

  it('uses alt fallback when aiImagePrompt empty', () => {
    const r = resolveMediaAiImagePrompt({ aiImagePrompt: null, alt: 'Coffee makers' })
    expect(r.skipped).toBe(false)
    if (!r.skipped) {
      expect(r.promptText).toBe('thumbnail image for this blog title: Coffee makers')
      expect(r.source).toBe('alt_fallback')
    }
  })

  it('truncateErrorMessage caps length', () => {
    expect(truncateErrorMessage('x'.repeat(600), 10).length).toBeLessThanOrEqual(12)
  })
})
