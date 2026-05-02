import { describe, expect, it } from 'vitest'

import { buildStrictCategoryContainsWhere } from '@/utilities/reviewsListingArticleWhere'

describe('buildStrictCategoryContainsWhere', () => {
  it('uses sentinel when category id list empty', () => {
    expect(buildStrictCategoryContainsWhere([])).toEqual({ id: { in: [-1] } })
  })

  it('filters non-positive IDs', () => {
    expect(buildStrictCategoryContainsWhere([0, -3, NaN as unknown as number])).toEqual({
      id: { in: [-1] },
    })
  })

  it('ORs categories.contains per id', () => {
    expect(buildStrictCategoryContainsWhere([10, 20])).toEqual({
      or: [{ categories: { contains: 10 } }, { categories: { contains: 20 } }],
    })
  })

  it('dedup invalid mixed with valid', () => {
    expect(buildStrictCategoryContainsWhere([undefined as unknown as number, 5])).toEqual({
      or: [{ categories: { contains: 5 } }],
    })
  })
})
