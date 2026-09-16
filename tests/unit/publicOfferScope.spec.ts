import { beforeEach, describe, expect, it, vi } from 'vitest'

const { find } = vi.hoisted(() => ({ find: vi.fn() }))
vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))

import { getActiveOffersForSite } from '@/utilities/publicSiteQueries'

describe('public offer site scope', () => {
  beforeEach(() => {
    find.mockReset()
    find.mockImplementation(async (args: { select?: { sites?: boolean } }) => ({
      docs: [
        { id: 1, title: 'Current site', sites: [10] },
        { id: 2, title: 'Other site', sites: [20] },
        { id: 3, title: 'Shared offer', sites: [] },
      ].map(row => args.select?.sites ? row : { ...row, sites: undefined }),
    }))
  })

  it('retains site relations in the query and excludes offers assigned elsewhere', async () => {
    const offers = await getActiveOffersForSite(10)
    expect(offers.map(offer => offer.id)).toEqual([1, 3])
    expect(find.mock.calls[0][0]).toMatchObject({
      select: { sites: true }, populate: { sites: { slug: true } },
    })
  })
})
