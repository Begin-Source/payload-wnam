import { describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

import {
  MAX_PIPELINE_DRAIN_BATCHES,
  nextScopedPipelineDrainBatchAction,
} from '@/utilities/pipelineRunNextDrain'
import {
  PIPELINE_WRITING_SCOPE_JOB_TYPES,
  buildWritingScopePendingWhere,
  listWritingScopePendingJobIds,
  resolveWritingScope,
} from '@/utilities/pipelineWritingScope'

describe('pipelineWritingScope', () => {
  it('buildWritingScopePendingWhere: article + brief uses OR with status pending and jobType whitelist', () => {
    const w = buildWritingScopePendingWhere(7, 42)
    expect(w).toEqual({
      and: [
        { status: { equals: 'pending' } },
        { jobType: { in: [...PIPELINE_WRITING_SCOPE_JOB_TYPES] } },
        {
          or: [{ article: { equals: 7 } }, { contentBrief: { equals: 42 } }],
        },
      ],
    })
  })

  it('buildWritingScopePendingWhere returns null when both ids null', () => {
    expect(buildWritingScopePendingWhere(null, null)).toBeNull()
  })

  it('resolveWritingScope requires at least one id', async () => {
    const payload = { findByID: vi.fn() } as unknown as Payload
    const r = await resolveWritingScope(payload, {} as never, {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('articleId')
  })

  it('resolveWritingScope: brief-only succeeds', async () => {
    const payload = { findByID: vi.fn() } as unknown as Payload
    const r = await resolveWritingScope(payload, {} as never, { briefId: 3 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.scope).toEqual({ articleId: null, briefId: 3 })
  })

  it('resolveWritingScope: loads sourceBrief from article', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ sourceBrief: 9 }),
    } as unknown as Payload
    const r = await resolveWritingScope(payload, {} as never, { articleId: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.scope).toEqual({ articleId: 1, briefId: 9 })
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'articles',
        id: '1',
      }),
    )
  })

  it('resolveWritingScope: rejects briefId mismatch vs article sourceBrief', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ sourceBrief: 9 }),
    } as unknown as Payload
    const r = await resolveWritingScope(payload, {} as never, { articleId: 1, briefId: 99 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/match/)
  })

  it('listWritingScopePendingJobIds returns numeric ids from find', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 1 }, { id: 2 }, { id: 'skip' as unknown as number }],
      }),
    } as unknown as Payload
    const ids = await listWritingScopePendingJobIds(payload, {} as never, 10, null)
    expect(ids).toEqual([1, 2])
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'workflow-jobs',
        overrideAccess: false,
        where: buildWritingScopePendingWhere(10, null),
      }),
    )
  })
})

describe('nextScopedPipelineDrainBatchAction', () => {
  it('stops ok when scopeDone true after a batch', () => {
    expect(
      nextScopedPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'no_pending',
        scopeDone: true,
        batchesCompleted: 1,
      }),
    ).toBe('stop_ok')
  })

  it('continues when budget hit but scope not done', () => {
    expect(
      nextScopedPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'budget',
        scopeDone: false,
        batchesCompleted: 1,
      }),
    ).toBe('run')
  })

  it('stops error when max batches cap', () => {
    expect(
      nextScopedPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'budget',
        scopeDone: false,
        batchesCompleted: MAX_PIPELINE_DRAIN_BATCHES,
      }),
    ).toBe('stop_error')
  })
})
