import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

const catchupMock = vi.hoisted(() => vi.fn())
const trySkMock = vi.hoisted(() => vi.fn())

vi.mock('@/app/api/pipeline/lib/articlePipelineChain', () => ({
  enqueueArticlePipelineCatchup: catchupMock,
}))

vi.mock('@/app/api/pipeline/lib/enqueueDraftSkeletonAfterBrief', () => ({
  tryEnqueueDraftSkeletonJob: trySkMock,
}))

import { bootstrapWritingScopeIfIdle } from '@/utilities/bootstrapWritingScope'

describe('bootstrapWritingScopeIfIdle', () => {
  const user = {} as never

  beforeEach(() => {
    catchupMock.mockReset()
    trySkMock.mockReset()
  })

  it('article scope: calls enqueueArticlePipelineCatchup', async () => {
    catchupMock.mockResolvedValue({ ok: true, messages: ['入队 draft_section × 1'] })
    const payload = { find: vi.fn(), findByID: vi.fn() } as unknown as Payload

    const r = await bootstrapWritingScopeIfIdle(payload, user, { articleId: 42, briefId: 7 })

    expect(catchupMock).toHaveBeenCalledTimes(1)
    expect(catchupMock).toHaveBeenCalledWith(payload, 42)
    expect(trySkMock).not.toHaveBeenCalled()
    expect(r.created).toBe(true)
    expect(r.summaries).toContain('入队 draft_section × 1')
    expect(r.error).toBeUndefined()
  })

  it('article scope: propagates catchup error', async () => {
    catchupMock.mockResolvedValue({ ok: false, error: 'article_missing_sourceBrief' })
    const payload = { find: vi.fn(), findByID: vi.fn() } as unknown as Payload

    const r = await bootstrapWritingScopeIfIdle(payload, user, { articleId: 1, briefId: null })

    expect(r.error).toBe('article_missing_sourceBrief')
    expect(r.created).toBe(false)
  })

  it('brief only, no articles: loads brief and enqueues draft_skeleton', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 0, docs: [] })
    const findByID = vi.fn().mockResolvedValue({
      id: 8,
      site: { id: 100 },
      tenant: 5,
    })
    trySkMock.mockResolvedValue({ created: true, id: 501 })
    const payload = { find, findByID } as unknown as Payload

    const r = await bootstrapWritingScopeIfIdle(payload, user, { articleId: null, briefId: 8 })

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'articles',
        where: { sourceBrief: { equals: 8 } },
        sort: '-createdAt',
        limit: 2,
        user,
        overrideAccess: false,
      }),
    )
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'content-briefs',
        id: '8',
        user,
        overrideAccess: false,
      }),
    )
    expect(trySkMock).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        briefId: 8,
        siteNumeric: 100,
        tenantNumeric: 5,
      }),
    )
    expect(r.created).toBe(true)
    expect(r.summaries.some((s) => s.includes('501'))).toBe(true)
  })

  it('brief only, multiple articles: warns and catchups latest id', async () => {
    const find = vi.fn().mockResolvedValue({
      totalDocs: 3,
      docs: [{ id: 300 }, { id: 200 }],
    })
    const findByID = vi.fn()
    catchupMock.mockResolvedValue({ ok: true, messages: ['入队 draft_finalize × 1'] })
    const payload = { find, findByID } as unknown as Payload

    const r = await bootstrapWritingScopeIfIdle(payload, user, { articleId: null, briefId: 1 })

    expect(trySkMock).not.toHaveBeenCalled()
    expect(catchupMock).toHaveBeenCalledWith(payload, 300)
    expect(r.summaries[0]).toMatch(/篇文章关联同一/)
    expect(r.created).toBe(true)
  })

  it('brief only, brief not readable: error', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 0, docs: [] })
    const findByID = vi.fn().mockResolvedValue(null)
    const payload = { find, findByID } as unknown as Payload

    const r = await bootstrapWritingScopeIfIdle(payload, user, { articleId: null, briefId: 99 })

    expect(r.error).toBe('内容大纲不存在或无权访问')
    expect(trySkMock).not.toHaveBeenCalled()
  })

  it('brief only, draft_skeleton not created: summaries explain', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 0, docs: [] })
    const findByID = vi.fn().mockResolvedValue({ site: 1, tenant: 2 })
    trySkMock.mockResolvedValue({ created: false, reason: 'draft_skeleton_already_pending' })
    const payload = { find, findByID } as unknown as Payload

    const r = await bootstrapWritingScopeIfIdle(payload, user, { articleId: null, briefId: 5 })

    expect(r.created).toBe(false)
    expect(r.summaries.join('')).toMatch(/未入队 draft_skeleton/)
  })
})
