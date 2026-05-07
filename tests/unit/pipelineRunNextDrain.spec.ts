import { describe, expect, it } from 'vitest'

import {
  MAX_PIPELINE_DRAIN_BATCHES,
  nextPipelineDrainBatchAction,
} from '@/utilities/pipelineRunNextDrain'

describe('nextPipelineDrainBatchAction', () => {
  it('runs again on budget below max batches', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'budget',
        batchesCompleted: 1,
      }),
    ).toBe('run')
  })

  it('runs again on max_runs', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'max_runs',
        batchesCompleted: 5,
      }),
    ).toBe('run')
  })

  it('stops OK on no_pending', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'no_pending',
        batchesCompleted: 3,
      }),
    ).toBe('stop_ok')
  })

  it('stops error on HTTP failure', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: false,
        stoppedReason: 'budget',
        batchesCompleted: 1,
      }),
    ).toBe('stop_error')
  })

  it('stops error on failure stoppedReason', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: false,
        stoppedReason: 'failure',
        batchesCompleted: 1,
      }),
    ).toBe('stop_error')
  })

  it('stops error when hitting max batches with wantMore', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'budget',
        batchesCompleted: MAX_PIPELINE_DRAIN_BATCHES,
      }),
    ).toBe('stop_error')
  })

  it('respects custom maxBatches', () => {
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'max_runs',
        batchesCompleted: 10,
        maxBatches: 10,
      }),
    ).toBe('stop_error')
    expect(
      nextPipelineDrainBatchAction({
        httpOk: true,
        bodyOk: true,
        stoppedReason: 'max_runs',
        batchesCompleted: 9,
        maxBatches: 10,
      }),
    ).toBe('run')
  })
})
