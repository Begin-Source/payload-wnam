import { describe, expect, it, vi } from 'vitest'

import {
  enqueueDraftSkeletonAfterBriefGenerate,
  previewDraftSkeletonEnqueue,
  tryEnqueueDraftSkeletonJob,
} from '@/app/api/pipeline/lib/enqueueDraftSkeletonAfterBrief'

describe('enqueueDraftSkeletonAfterBriefGenerate', () => {
  it('skips when duplicate pending draft_skeleton exists', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
      create: vi.fn(),
      findByID: vi.fn(),
    }
    const r = await enqueueDraftSkeletonAfterBriefGenerate(payload as never, {
      completedBriefJobId: 1,
      briefId: 99,
      siteNumeric: 2,
    })
    expect(r).toEqual({ created: false, reason: 'draft_skeleton_already_pending' })
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.findByID).not.toHaveBeenCalled()
  })

  it('creates draft_skeleton when no duplicate', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
      findByID: vi.fn().mockResolvedValue({ tenant: 99 }),
      create: vi.fn().mockResolvedValue({ id: 42 }),
    }
    const r = await enqueueDraftSkeletonAfterBriefGenerate(payload as never, {
      completedBriefJobId: 7,
      briefId: 99,
      siteNumeric: 2,
    })
    expect(r).toEqual({ created: true, id: 42 })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'workflow-jobs',
        data: expect.objectContaining({
          jobType: 'draft_skeleton',
          status: 'pending',
          contentBrief: 99,
          tenant: 99,
          parentJob: 7,
          site: 2,
          input: { briefId: 99, chainedFrom: '7' },
        }),
        overrideAccess: true,
      }),
    )
  })

  it('tryEnqueueDraftSkeletonJob manual enqueue omits parentJob', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
      create: vi.fn().mockResolvedValue({ id: 100 }),
    }
    const r = await tryEnqueueDraftSkeletonJob(payload as never, {
      briefId: 5,
      siteNumeric: 3,
      tenantNumeric: 88,
    })
    expect(r).toEqual({ created: true, id: 100 })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'workflow-jobs',
        data: expect.objectContaining({
          contentBrief: 5,
          site: 3,
          tenant: 88,
          input: { briefId: 5, source: 'manual_enqueue' },
        }),
        overrideAccess: true,
      }),
    )
  })

  it('returns missing_tenant when brief and site lack tenant', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
      findByID: vi
        .fn()
        .mockResolvedValueOnce({ tenant: null })
        .mockResolvedValueOnce({ tenant: null }),
      create: vi.fn(),
    }
    const r = await tryEnqueueDraftSkeletonJob(payload as never, {
      briefId: 12,
      siteNumeric: 3,
    })
    expect(r).toEqual({ created: false, reason: 'missing_tenant_on_brief_or_site' })
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('previewDraftSkeletonEnqueue skips when duplicate pending exists', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
      findByID: vi.fn(),
    }
    const r = await previewDraftSkeletonEnqueue(payload as never, {
      briefId: 9,
      siteNumeric: 1,
      tenantNumeric: 2,
    })
    expect(r).toEqual({ wouldCreate: false, reason: 'draft_skeleton_already_pending' })
  })

  it('previewDraftSkeletonEnqueue wouldCreate when tenant passed and no dup', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
      findByID: vi.fn(),
    }
    const r = await previewDraftSkeletonEnqueue(payload as never, {
      briefId: 9,
      siteNumeric: 1,
      tenantNumeric: 5,
    })
    expect(r).toEqual({ wouldCreate: true })
  })
})
