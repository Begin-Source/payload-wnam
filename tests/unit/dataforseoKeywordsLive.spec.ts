import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/integrations/dataforseo/client', () => ({
  dataForSeoPost: vi.fn(),
}))

import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { fetchKeywordsForKeywordsLive } from '@/services/integrations/dataforseo/keywords'

describe('fetchKeywordsForKeywordsLive', () => {
  beforeEach(() => {
    vi.mocked(dataForSeoPost).mockReset()
  })

  it('calls DFS per seed and dedupes by term', async () => {
    vi.mocked(dataForSeoPost)
      .mockResolvedValueOnce([
        {
          results: [
            {
              keyword: 'wireless earbuds cheap',
              search_volume: 100,
              keyword_difficulty: 30,
              search_intent: 'commercial investigation',
              cpc: 1.2,
            },
            {
              keyword: 'overlap',
              search_volume: 50,
              keyword_difficulty: 20,
              search_intent: 'transactional',
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          results: [
            {
              keyword: 'overlap',
              search_volume: 999,
              keyword_difficulty: 10,
              search_intent: 'transactional',
            },
          ],
        },
      ])

    const rows = await fetchKeywordsForKeywordsLive({
      seeds: ['wireless earbuds', 'other'],
      locationCode: 2840,
      languageCode: 'en',
      limitTotal: 20,
    })
    expect(rows).toHaveLength(2)
    const overlap = rows.find((x) => x.term === 'overlap')
    expect(overlap?.volume).toBe(50)
    expect(vi.mocked(dataForSeoPost)).toHaveBeenCalledTimes(2)
    expect(rows[0].intent).toBe('commercial')
  })
})
