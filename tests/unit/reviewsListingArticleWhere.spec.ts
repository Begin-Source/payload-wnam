import { describe, expect, it } from 'vitest'

import {
  buildListingWhereExcludingArticleIds,
  buildStrictCategoryContainsWhere,
} from '@/utilities/reviewsListingArticleWhere'

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

describe('buildListingWhereExcludingArticleIds', () => {
  it('omits id.not_in when exclude article id list empty', () => {
    expect(buildListingWhereExcludingArticleIds([1, 2], [])).toEqual({
      or: [{ categories: { contains: 1 } }, { categories: { contains: 2 } }],
    })
  })

  it('filters invalid exclude article ids and adds id.not_in', () => {
    expect(
      buildListingWhereExcludingArticleIds([10], [0, -1, 7, NaN as unknown as number]),
    ).toEqual({
      and: [{ or: [{ categories: { contains: 10 } }] }, { id: { not_in: [7] } }],
    })
  })

  it('dedupes duplicate exclude article ids', () => {
    expect(buildListingWhereExcludingArticleIds([10], [7, 7, 8])).toEqual({
      and: [
        { or: [{ categories: { contains: 10 } }] },
        // Set iteration order preserves first-seen uniq
        { id: { not_in: [7, 8] } },
      ],
    })
  })

  it('returns sentinel plus not_in when include empty but exclude nonempty', () => {
    expect(buildListingWhereExcludingArticleIds([], [99])).toEqual({
      and: [{ id: { in: [-1] } }, { id: { not_in: [99] } }],
    })
  })

  it('combines category include OR with multiple excluded article ids', () => {
    expect(buildListingWhereExcludingArticleIds([10], [20, 30])).toEqual({
      and: [{ or: [{ categories: { contains: 10 } }] }, { id: { not_in: [20, 30] } }],
    })
  })
})
