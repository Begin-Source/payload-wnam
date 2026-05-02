import { describe, expect, it } from 'vitest'

import {
  buildAmazonSearchUrl,
  resolveAffiliateTag,
} from '@/utilities/offerReviewMdx/buildOfferReviewContext'

describe('buildAmazonSearchUrl', () => {
  it('returns undefined for empty or whitespace keywords', () => {
    expect(buildAmazonSearchUrl('')).toBeUndefined()
    expect(buildAmazonSearchUrl('   ')).toBeUndefined()
    expect(buildAmazonSearchUrl('\t')).toBeUndefined()
  })

  it('encodes k= and passes explicit tag', () => {
    const u = buildAmazonSearchUrl('foam roller gloves', 'my-tag-42')
    expect(u).toBe(
      `https://www.amazon.com/s?k=${encodeURIComponent('foam roller gloves')}&tag=${encodeURIComponent('my-tag-42')}`,
    )
  })

  it('falls back to resolveAffiliateTag when tag omitted', () => {
    const prevDefault = process.env.AMAZON_ASSOCIATE_TAG_DEFAULT
    const prevPublic = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG
    delete process.env.AMAZON_ASSOCIATE_TAG_DEFAULT
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG
    try {
      const fallback = resolveAffiliateTag()
      const u = buildAmazonSearchUrl('Jump Rope')
      expect(u).toContain(`k=${encodeURIComponent('Jump Rope')}`)
      expect(u).toContain(`tag=${encodeURIComponent(fallback)}`)
    } finally {
      if (prevDefault !== undefined) process.env.AMAZON_ASSOCIATE_TAG_DEFAULT = prevDefault
      else delete process.env.AMAZON_ASSOCIATE_TAG_DEFAULT
      if (prevPublic !== undefined) process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = prevPublic
      else delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG
    }
  })
})
