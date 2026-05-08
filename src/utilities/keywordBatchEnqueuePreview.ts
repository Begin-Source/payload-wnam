/** Shared typing for `POST /api/admin/articles/batch-enqueue` dryRun / enqueue responses used by admin drawers + Banner. */

export type BatchEnqueueOkJson = {
  ok?: boolean
  error?: string
  enqueued?: number
  skipped?: number
  limit?: number
  pickedTerms?: string[]
  errorsSample?: string[]
  pickedSeasonalMeta?: Array<{ term: string; seasonalScore: number }>
  pickedRefreshMeta?: Array<{
    keywordId: number
    articleId: number
    decayScore: number
    decayReason: string
  }>
}
