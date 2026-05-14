import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  articleBodyHasSectionPlaceholders,
  ensureDraftSectionCatchupForSite,
  listPendingWorkflowJobIdsForSite,
  runSiteContentRunner,
  SITE_CONTENT_RUNNER_JOB_TYPE,
} from '@/utilities/siteContentRunner'

vi.mock('@/app/api/pipeline/lib/articlePipelineChain', () => ({
  enqueueArticlePipelineCatchup: vi.fn(async (_payload, articleId: number) => ({
    ok: true,
    messages: [`入队 draft_section × 1 for ${articleId}`],
  })),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function payloadMockWithPendingSequences(sequences: Array<Array<{ id: number }>>) {
  return {
    find: vi.fn(async () => ({ docs: sequences.shift() ?? [] })),
    update: vi.fn(async () => ({})),
  }
}

describe('siteContentRunner', () => {
  beforeEach(() => {
    process.env.PAYLOAD_SECRET = 'secret123'
  })

  it('lists site pending jobs excluding the runner job itself', async () => {
    const payload = payloadMockWithPendingSequences([[{ id: 10 }, { id: 11 }]])
    const ids = await listPendingWorkflowJobIdsForSite(payload as never, 7)

    expect(ids).toEqual([10, 11])
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'workflow-jobs',
        where: {
          and: [
            { site: { equals: 7 } },
            { status: { equals: 'pending' } },
            { jobType: { not_equals: SITE_CONTENT_RUNNER_JOB_TYPE } },
          ],
        },
      }),
    )
  })

  it('detects draft skeleton placeholders in article body', () => {
    expect(articleBodyHasSectionPlaceholders({ root: { children: ['<!-- section:intro -->'] } })).toBe(
      true,
    )
    expect(articleBodyHasSectionPlaceholders({ root: { children: ['real content'] } })).toBe(false)
  })

  it('enqueues section catchup for existing article skeletons before running site jobs', async () => {
    const payload = {
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'articles') {
          return {
            docs: [
              {
                id: 31,
                sourceBrief: 11,
                body: { root: { children: [{ text: '<!-- section:intro -->' }] } },
              },
              {
                id: 32,
                sourceBrief: 12,
                body: { root: { children: [{ text: 'already written' }] } },
              },
            ],
          }
        }
        return { docs: [] }
      }),
    }

    const result = await ensureDraftSectionCatchupForSite(payload as never, 7)

    expect(result).toMatchObject({ checked: 1, enqueued: 1 })
    expect(result.messages[0]).toContain('article #31')
  })

  it('runs pending site jobs in backend batches until the site has no pending jobs', async () => {
    const payload = payloadMockWithPendingSequences([[], [{ id: 21 }], [], []])
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        executed: true,
        jobId: 21,
        jobType: 'brief_generate',
        result: 'completed',
      }),
    )

    const result = await runSiteContentRunner({
      payload: payload as never,
      origin: 'http://localhost:3000',
      runnerJobId: 99,
      input: { siteId: 7, batchMaxRuns: 1, batchBudgetMs: 5000, maxBatches: 5 },
      fetchImpl,
    })

    expect(result).toMatchObject({
      ok: true,
      siteId: 7,
      batches: 1,
      totalTicks: 1,
      stoppedReason: 'no_pending',
      pendingRemaining: 0,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const init = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0][1]
    expect(JSON.parse(init.body as string)).toEqual({
      execute: true,
      constrainedJobIds: [21],
    })
    expect(payload.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collection: 'workflow-jobs',
        id: 99,
        data: expect.objectContaining({
          status: 'completed',
          output: expect.objectContaining({ ok: true, stoppedReason: 'no_pending' }),
        }),
      }),
    )
  })
})
