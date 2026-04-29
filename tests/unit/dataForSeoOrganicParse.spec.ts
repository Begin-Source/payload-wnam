import { describe, expect, it } from 'vitest'

import { parseOrganicPositionAndAiOverview } from '@/utilities/dataForSeoOrganicParse'

describe('parseOrganicPositionAndAiOverview', () => {
  it('finds rank_absolute for matching host', () => {
    const raw = {
      tasks: [
        {
          result: [
            {
              items: [
                { type: 'organic', rank_absolute: 1, url: 'https://other.com/' },
                { type: 'organic', rank_absolute: 3, url: 'https://www.example.com/page' },
              ],
            },
          ],
        },
      ],
    }
    const r = parseOrganicPositionAndAiOverview(raw, 'example.com')
    expect(r.position).toBe(3)
  })
})
