import { describe, expect, it } from 'vitest'
import { buildOfferReviewMdxPromptVarsFromContext } from '@/utilities/offerReviewMdx/buildOfferReviewPrompt'

describe('offer review prompt', () => {
  it('retains the supplied MDX template in the model prompt variables', () => {
    const template = '# Required review structure\n\n## Product verdict'
    const vars = buildOfferReviewMdxPromptVarsFromContext(template, {
      offerId: 7, title: 'Test camera', asin: 'B000000001', brand: 'Test',
      rating: 4.5, imageUrl: '', features: ['Lightweight'], category: 'Cameras',
      reviewSlug: 'test-camera', amazonUrl: 'https://www.amazon.com/dp/B000000001',
      date: '2026-01-01', affiliateTag: 'test-20',
    })
    expect(vars.template_mdx).toBe(template)
    expect(vars.raw_product_title).toBe('Test camera')
  })
})
