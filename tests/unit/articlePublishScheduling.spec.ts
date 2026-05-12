import { describe, expect, it } from 'vitest'

import { evaluateArticlePublishEligibility } from '@/utilities/articlePublishScheduling'

const bodyWithDisclosure = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'text',
            text: 'Affiliate disclosure: we may earn commissions from partner links. This guide compares products.',
            version: 1,
          },
        ],
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
}

describe('articlePublishScheduling', () => {
  it('allows a quality money page with disclosure, offers, and author', () => {
    const r = evaluateArticlePublishEligibility({
      status: 'draft',
      qualityScore: 84,
      affiliatePageLayout: 'commercial_hub',
      relatedOffers: [1],
      author: 1,
      vetoCodes: [],
      body: bodyWithDisclosure,
    })
    expect(r.eligible).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('blocks money pages missing affiliate requirements', () => {
    const r = evaluateArticlePublishEligibility({
      status: 'draft',
      qualityScore: 84,
      affiliatePageLayout: 'product_comparison',
      relatedOffers: [],
      author: 1,
      vetoCodes: [],
      body: { root: { ...bodyWithDisclosure.root, children: [] } },
    })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('missing_affiliate_disclosure')
    expect(r.reasons).toContain('money_page_missing_related_offers')
  })
})
