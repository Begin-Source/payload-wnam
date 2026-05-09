import { describe, expect, it } from 'vitest'

import {
  articleSiteIdFromDoc,
  normalizeRelatedOfferIdList,
  offerEligibleForArticleSite,
  pruneArticleRelatedOffersFromInputs,
  pruneRelatedOfferIds,
  type MinimalOfferForPrune,
} from '@/utilities/pruneArticleRelatedOffers'

function mapOffers(...offers: MinimalOfferForPrune[]): Map<number, MinimalOfferForPrune> {
  return new Map(offers.map((o) => [o.id, o]))
}

describe('pruneArticleRelatedOffers', () => {
  it('normalizeRelatedOfferIdList: dedupes and keeps order', () => {
    expect(normalizeRelatedOfferIdList([1, 2, 1, { id: 3 }])).toEqual([1, 2, 3])
    expect(normalizeRelatedOfferIdList(null)).toEqual([])
    expect(normalizeRelatedOfferIdList(5)).toEqual([5])
  })

  it('articleSiteIdFromDoc: number or relation object', () => {
    expect(articleSiteIdFromDoc(7)).toBe(7)
    expect(articleSiteIdFromDoc({ id: 8 })).toBe(8)
    expect(articleSiteIdFromDoc(null)).toBeNull()
    expect(articleSiteIdFromDoc({})).toBeNull()
  })

  it('offerEligibleForArticleSite: missing', () => {
    expect(offerEligibleForArticleSite(1, undefined)).toBe('missing')
  })

  it('offerEligibleForArticleSite: not active', () => {
    const o: MinimalOfferForPrune = { id: 1, status: 'draft', siteIds: [] }
    expect(offerEligibleForArticleSite(1, o)).toBe('not_active')
  })

  it('offerEligibleForArticleSite: no article site — only active matters', () => {
    const o: MinimalOfferForPrune = { id: 1, status: 'active', siteIds: [99] }
    expect(offerEligibleForArticleSite(null, o)).toBeNull()
  })

  it('offerEligibleForArticleSite: empty siteIds on offer — global', () => {
    const o: MinimalOfferForPrune = { id: 1, status: 'active', siteIds: [] }
    expect(offerEligibleForArticleSite(5, o)).toBeNull()
  })

  it('offerEligibleForArticleSite: scoped offer must include article site', () => {
    const ok: MinimalOfferForPrune = { id: 1, status: 'active', siteIds: [5, 6] }
    const bad: MinimalOfferForPrune = { id: 2, status: 'active', siteIds: [99] }
    expect(offerEligibleForArticleSite(5, ok)).toBeNull()
    expect(offerEligibleForArticleSite(5, bad)).toBe('site_mismatch')
  })

  it('pruneRelatedOfferIds: drops missing, inactive, site mismatch', () => {
    const offers = mapOffers(
      { id: 10, status: 'active', siteIds: [] },
      { id: 11, status: 'paused', siteIds: [] },
      { id: 12, status: 'active', siteIds: [1] },
    )
    const r = pruneRelatedOfferIds(1, [10, 11, 12, 13], offers)
    expect(r.pruned).toEqual([10, 12])
    expect(r.changed).toBe(true)
    expect(r.dropped).toEqual([
      { id: 11, reason: 'not_active' },
      { id: 13, reason: 'missing' },
    ])
  })

  it('pruneRelatedOfferIds: unchanged when all valid', () => {
    const offers = mapOffers({ id: 1, status: 'active', siteIds: [2] })
    const r = pruneRelatedOfferIds(2, [1], offers)
    expect(r.pruned).toEqual([1])
    expect(r.changed).toBe(false)
    expect(r.dropped).toEqual([])
  })

  it('pruneArticleRelatedOffersFromInputs: wires site + raw ids', () => {
    const offers = mapOffers({ id: 3, status: 'active', siteIds: [1] })
    const r = pruneArticleRelatedOffersFromInputs({
      site: { id: 1 },
      relatedOffersRaw: [3, { id: 3 }],
      offersById: offers,
    })
    expect(r.articleSiteId).toBe(1)
    expect(r.normalizedIds).toEqual([3])
    expect(r.pruned).toEqual([3])
    expect(r.changed).toBe(false)
  })
})
