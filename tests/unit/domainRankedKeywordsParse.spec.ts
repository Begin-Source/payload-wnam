import { describe, expect, it } from 'vitest'

import {
  extractRankedKeywordsItems,
  keywordTermFromRankedKeywordItem,
  serpPositionFromRankedKeywordItem,
} from '@/utilities/domainRankedKeywordsParse'

describe('domainRankedKeywordsParse', () => {
  const envelope = {
    tasks: [
      {
        result: [
          {
            total_count: 2,
            items: [
              {
                keyword: 'yoga mat',
                keyword_data: { keyword_difficulty: 12 },
                ranked_serp_element: {
                  serp_item: { rank_group: 3, rank_absolute: 5, type: 'organic' },
                },
              },
              {
                keyword: 'only_absolute',
                ranked_serp_element: { serp_item: { rank_absolute: 12 } },
              },
            ],
          },
        ],
      },
    ],
  }

  it('extractRankedKeywordsItems returns items', () => {
    const items = extractRankedKeywordsItems(envelope)
    expect(items).toHaveLength(2)
    expect(keywordTermFromRankedKeywordItem(items[0])).toBe('yoga mat')
  })

  it('serpPositionFromRankedKeywordItem prefers rank_group', () => {
    const items = extractRankedKeywordsItems(envelope)
    expect(serpPositionFromRankedKeywordItem(items[0])).toBe(3)
    expect(serpPositionFromRankedKeywordItem(items[1])).toBe(12)
  })

  it('extractRankedKeywordsItems handles empty', () => {
    expect(extractRankedKeywordsItems({})).toEqual([])
    expect(extractRankedKeywordsItems({ tasks: [] })).toEqual([])
  })
})
