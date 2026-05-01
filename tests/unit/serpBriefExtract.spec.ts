import { describe, expect, it } from 'vitest'

import { extractSerpBriefContext } from '@/utilities/serpBriefExtract'

describe('extractSerpBriefContext', () => {
  it('parses organic top rows and collects non-organic feature types', () => {
    const raw = {
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              items: [
                { type: 'featured_snippet', rank_absolute: 1 },
                {
                  type: 'organic',
                  rank_absolute: 2,
                  title: 'A',
                  url: 'https://a.example.com/z',
                  domain: 'a.example.com',
                },
                {
                  type: 'organic',
                  rank_absolute: 9,
                  title: 'B',
                  url: 'https://www.b.example/foo',
                  description: 'Desc',
                },
              ],
            },
          ],
        },
      ],
    }
    const ctx = extractSerpBriefContext(raw)
    expect(ctx).not.toBeNull()
    expect(ctx!.featureTypes).toContain('featured_snippet')
    expect(ctx!.organicTop10.map((x) => x.rank)).toEqual([2, 9])
    expect(ctx!.organicTop10[1].domain).toContain('b.example')
  })

  it('returns null when envelope status fails', () => {
    expect(extractSerpBriefContext({ status_code: 40102, tasks: [] })).toBeNull()
  })

  it('returns null when no organic urls', () => {
    expect(
      extractSerpBriefContext({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ items: [{ type: 'featured_snippet' }] }] }],
      }),
    ).toBeNull()
  })
})
