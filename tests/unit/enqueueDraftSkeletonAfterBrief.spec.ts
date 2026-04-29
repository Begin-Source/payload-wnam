import { describe, expect, it, vi } from 'vitest'

import { enqueueDraftSkeletonAfterBriefGenerate } from '@/app/api/pipeline/lib/enqueueDraftSkeletonAfterBrief'

describe('enqueueDraftSkeletonAfterBriefGenerate', () => {
  it('skips when duplicate pending draft_skeleton exists', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
      create: vi.fn(),
    }
    const r = await enqueueDraftSkeletonAfterBriefGenerate(payload as never, {
      completedBriefJobId: 1,
      briefId: 99,
      siteNumeric: 2,
    })
    expect(r).toEqual({ created: false, reason: 'draft_skeleton_already_pending' })
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('creates draft_skeleton when no duplicate', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
      create: vi.fn().mockResolvedValue({ id: 42 }),
    }
    const r = await enqueueDraftSkeletonAfterBriefGenerate(payload as never, {
      completedBriefJobId: 7,
      briefId: 99,
      siteNumeric: 2,
    })
    expect(r).toEqual({ created: true, id: 42 })
    expect(payload.create).toHaveBeenCalledWith({
      collection: 'workflow-jobs',
      data: expect.objectContaining({
        jobType: 'draft_skeleton',
        status: 'pending',
        contentBrief: 99,
        parentJob: 7,
        site: 2,
      }),
    })
  })
})
