import { describe, expect, it, vi } from 'vitest'

import { appendSerpSnapshot, findRecentSerpSnapshotRaw } from '@/utilities/serpSnapshotPersist'

function mockPayload(findResult: unknown) {
  return {
    find: vi.fn().mockResolvedValue(findResult),
    create: vi.fn().mockResolvedValue({}),
  } as never
}

describe('serpSnapshotPersist', () => {
  it('findRecentSerpSnapshotRaw returns raw when doc exists', async () => {
    const raw = { tasks: [] }
    const payload = mockPayload({ docs: [{ raw }] })
    const out = await findRecentSerpSnapshotRaw({
      payload,
      keywordId: 1,
      locationLabel: '2840',
      deviceLabel: 'mobile',
    })
    expect(out).toEqual(raw)
    expect(payload.find).toHaveBeenCalledTimes(1)
  })

  it('findRecentSerpSnapshotRaw returns null when empty', async () => {
    const payload = mockPayload({ docs: [] })
    const out = await findRecentSerpSnapshotRaw({
      payload,
      keywordId: 1,
      locationLabel: '2840',
      deviceLabel: 'mobile',
    })
    expect(out).toBeNull()
  })

  it('appendSerpSnapshot calls create with tenant and json raw', async () => {
    const create = vi.fn().mockResolvedValue({})
    const payload = { create } as never
    await appendSerpSnapshot({
      payload,
      keywordId: 5,
      siteId: 2,
      tenantId: 9,
      searchQuery: 'test q',
      locationLabel: '2840',
      deviceLabel: 'mobile',
      raw: { foo: 1 },
    })
    expect(create).toHaveBeenCalledTimes(1)
    const arg = create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.keyword).toBe(5)
    expect(arg.data.site).toBe(2)
    expect(arg.data.tenant).toBe(9)
    expect(arg.data.raw).toEqual({ foo: 1 })
    expect(arg.data.engine).toBe('google')
  })
})
