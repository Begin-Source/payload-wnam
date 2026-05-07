/** Max POST /run-next rounds when draining selected pending jobs (client-side guard). */
export const MAX_PIPELINE_DRAIN_BATCHES = 150

export type NextPipelineDrainBatchAction = 'run' | 'stop_ok' | 'stop_error'

/**
 * After one successful HTTP response from POST /api/admin/pipeline/run-next,
 * decide whether to send another batch for the same jobIds snapshot.
 */
export function nextPipelineDrainBatchAction(args: {
  httpOk: boolean
  bodyOk?: boolean
  stoppedReason?: string
  batchesCompleted: number
  maxBatches?: number
}): NextPipelineDrainBatchAction {
  const max = args.maxBatches ?? MAX_PIPELINE_DRAIN_BATCHES
  if (!args.httpOk) return 'stop_error'
  if (args.bodyOk === false) return 'stop_error'
  if (args.stoppedReason === 'failure' || args.stoppedReason === 'aborted') return 'stop_error'
  if (args.stoppedReason === 'no_pending') return 'stop_ok'
  const wantMore = args.stoppedReason === 'budget' || args.stoppedReason === 'max_runs'
  if (wantMore && args.batchesCompleted >= max) return 'stop_error'
  if (wantMore) return 'run'
  return 'stop_ok'
}
