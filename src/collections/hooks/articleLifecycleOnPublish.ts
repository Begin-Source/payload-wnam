import type { CollectionBeforeChangeHook } from 'payload'

/**
 * First publish → SERP-tracked lifecycle entry (probation window for triage).
 */
export const articleLifecycleOnPublish: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const next = { ...data } as Record<string, unknown>
  const wasPublished = originalDoc?.status === 'published'
  const willPublish = next.status === 'published'
  if (!willPublish || wasPublished) {
    return next
  }
  if (next.publishedAt == null || next.publishedAt === '') {
    next.publishedAt = new Date().toISOString()
  }
  const stage = next.lifecycleStage as string | undefined
  if (!stage || stage === 'n_a') {
    next.lifecycleStage = 'probation'
    const end = new Date()
    end.setDate(end.getDate() + 90)
    next.probationEndsAt = end.toISOString()
  }
  return next
}
