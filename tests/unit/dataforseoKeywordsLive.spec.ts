import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/integrations/dataforseo/client', () => ({
  dataForSeoPost: vi.fn(),
}))

import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { fetchKeywordSuggestionsLive } from '@/services/integrations/dataforseo/keywords'

const LABS_ENDPOINT = '/v3/dataforseo_labs/google/keyword_suggestions/live'

function labsEnvelope(resultSlices: Record<string, unknown>[]) {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    tasks: [
      {
        status_code: 20000,
        status_message: 'Ok.',
        result: resultSlices,
      },
    ],
  }
}

describe('fetchKeywordSuggestionsLive', () => {
  beforeEach(() => {
    vi.mocked(dataForSeoPost).mockReset()
  })

  it('calls Labs per seed, maps kd/intent from Labs shape, dedupes by term', async () => {
    vi.mocked(dataForSeoPost)
      .mockResolvedValueOnce(
        labsEnvelope([
          {
            seed_keyword: 'wireless earbuds',
            items: [
              {
                keyword: 'wireless earbuds cheap',
                keyword_info: { search_volume: 100, cpc: 1.2 },
                keyword_properties: { keyword_difficulty: 30 },
                search_intent_info: { main_intent: 'commercial investigation' },
              },
              {
                keyword: 'overlap',
                keyword_info: { search_volume: 50 },
                keyword_properties: { keyword_difficulty: 20 },
                search_intent_info: { main_intent: 'transactional' },
              },
            ],
          },
        ]) as never,
      )
      .mockResolvedValueOnce(
        labsEnvelope([
          {
            seed_keyword: 'other',
            items: [
              {
                keyword: 'overlap',
                keyword_info: { search_volume: 999 },
                keyword_properties: { keyword_difficulty: 10 },
                search_intent_info: { main_intent: 'transactional' },
              },
            ],
          },
        ]) as never,
      )

    const rows = await fetchKeywordSuggestionsLive({
      seeds: ['wireless earbuds', 'other'],
      locationCode: 2840,
      languageCode: 'en',
      limitTotal: 20,
    })
    expect(rows).toHaveLength(2)
    const overlap = rows.find((x) => x.term === 'overlap')
    expect(overlap?.volume).toBe(50)
    expect(overlap?.kd).toBe(20)
    expect(vi.mocked(dataForSeoPost)).toHaveBeenCalledTimes(2)

    expect(vi.mocked(dataForSeoPost).mock.calls[0]?.[0]).toBe(LABS_ENDPOINT)
    const firstBody = vi.mocked(dataForSeoPost).mock.calls[0]?.[1] as {
      keyword: string
      include_serp_info: boolean
    }[]
    expect(firstBody[0].keyword).toBe('wireless earbuds')
    expect(firstBody[0].include_serp_info).toBe(false)

    expect(rows.find((x) => x.term === 'wireless earbuds cheap')?.intent).toBe('commercial')
    expect(rows.find((x) => x.term === 'overlap')?.intent).toBe('transactional')
  })

  it('merges seed_keyword_data KD/intent from slice parent', async () => {
    vi.mocked(dataForSeoPost).mockResolvedValueOnce(
      labsEnvelope([
        {
          seed_keyword: 'coffee maker',
          seed_keyword_data: {
            keyword: 'coffee maker',
            keyword_info: { search_volume: 5000, cpc: 2.5, monthly_searches: [{ year: 2024 }] },
          },
          keyword_properties: { keyword_difficulty: 42 },
          search_intent_info: { main_intent: 'transactional' },
          items: [],
        },
      ]) as never,
    )

    const rows = await fetchKeywordSuggestionsLive({
      seeds: ['coffee maker'],
      locationCode: 2840,
      languageCode: 'en',
      limitTotal: 10,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      term: 'coffee maker',
      volume: 5000,
      kd: 42,
      intent: 'transactional',
      cpc: 2.5,
    })
    expect(rows[0].trend).toEqual([{ year: 2024 }])
  })

  it('throws when envelope status_code is not 20000', async () => {
    vi.mocked(dataForSeoPost).mockResolvedValueOnce({
      status_code: 40102,
      status_message: 'No balance.',
      tasks: [],
    } as never)

    await expect(
      fetchKeywordSuggestionsLive({
        seeds: ['foo'],
        locationCode: 2840,
        languageCode: 'en',
        limitTotal: 10,
      }),
    ).rejects.toThrow(/DataForSEO:\s+40102/)
  })

  it('throws when task[0].status_code is not 20000', async () => {
    vi.mocked(dataForSeoPost).mockResolvedValueOnce({
      status_code: 20000,
      status_message: 'Ok.',
      tasks: [{ status_code: 40501, status_message: 'Bad params', result: [] }],
    } as never)

    await expect(
      fetchKeywordSuggestionsLive({
        seeds: ['foo'],
        locationCode: 2840,
        languageCode: 'en',
        limitTotal: 10,
      }),
    ).rejects.toThrow(/task\[0\]:\s+40501/)
  })
})
