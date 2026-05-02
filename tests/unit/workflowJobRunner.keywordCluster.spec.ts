import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/api/pipeline/lib/internalPipelineFetch', () => ({
  forwardPipelinePost: vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ),
  readJsonSafe: vi.fn(),
}))

import { dispatchWorkflowJob } from '@/app/api/pipeline/lib/workflowJobRunner'
import * as internalPipelineFetch from '@/app/api/pipeline/lib/internalPipelineFetch'

describe('dispatchWorkflowJob keyword_cluster', () => {
  const mockPayload = {
    find: vi.fn(async () => ({ docs: [] })),
    findByID: vi.fn(),
  } as unknown as Payload

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards to /api/pipeline/keyword-cluster with site relation and keywordIds', async () => {
    const req = new Request('http://test.local/api/pipeline/tick', {
      method: 'POST',
      headers: { 'x-internal-token': 'secret' },
    })

    await dispatchWorkflowJob(
      req,
      {
        id: 1,
        jobType: 'keyword_cluster',
        site: { id: 42 },
        input: { keywordIds: [7, 8], minOverlap: 4, refresh: true },
      },
      mockPayload,
    )

    expect(internalPipelineFetch.forwardPipelinePost).toHaveBeenCalledWith(
      req,
      '/api/pipeline/keyword-cluster',
      expect.objectContaining({
        siteId: 42,
        keywordIds: [7, 8],
        minOverlap: 4,
        refresh: true,
      }),
    )
  })

  it('falls back to input.siteId when no site relation', async () => {
    const req = new Request('http://test.local/x', {
      method: 'POST',
      headers: { 'x-internal-token': 'secret' },
    })

    await dispatchWorkflowJob(
      req,
      {
        id: 2,
        jobType: 'keyword_cluster',
        input: { siteId: 99, keywordIds: [1], minOverlap: 3 },
      },
      mockPayload,
    )

    expect(internalPipelineFetch.forwardPipelinePost).toHaveBeenCalledWith(
      req,
      '/api/pipeline/keyword-cluster',
      expect.objectContaining({
        siteId: 99,
        keywordIds: [1],
        minOverlap: 3,
      }),
    )
  })

  it('returns 400 when keywordIds missing', async () => {
    const req = new Request('http://test.local/x', {
      method: 'POST',
      headers: { 'x-internal-token': 'secret' },
    })

    const res = await dispatchWorkflowJob(
      req,
      {
        id: 3,
        jobType: 'keyword_cluster',
        site: { id: 1 },
        input: { keywordIds: [] },
      },
      mockPayload,
    )

    expect(res.status).toBe(400)
    expect(internalPipelineFetch.forwardPipelinePost).not.toHaveBeenCalled()
  })
})
