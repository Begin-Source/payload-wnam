import type { CollectionAfterChangeHook, Payload } from 'payload'

function relationId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }
  return null
}

function numericId(value: string | number | null): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

async function pendingArticleJob(payload: Payload, articleId: string | number, jobType: string): Promise<boolean> {
  const aid = numericId(articleId)
  if (aid == null) return false
  const n = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { status: { equals: 'pending' } },
        { jobType: { equals: jobType } },
        { article: { equals: aid } },
      ],
    },
  })
  return n.totalDocs > 0
}

/**
 * Sprint 8 / §11.4–11.5: enqueue pipeline jobs from article lifecycle events (best-effort, non-blocking).
 */
export const articleAfterChangeWorkflow: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  try {
    const payload = req.payload
    const article = doc as {
      id: string | number
      title?: string | null
      status?: string | null
      site?: unknown
      lifecycleStage?: string | null
      mergedInto?: unknown
    }
    const prev = previousDoc as { status?: string | null; lifecycleStage?: string | null } | null | undefined

    const wasPublished = prev?.status === 'published'
    const isPublished = article.status === 'published'
    if (isPublished && !wasPublished) {
      const siteId = relationId(article.site)
      const siteNum = numericId(siteId)
      const artNum = numericId(article.id)
      if (siteNum != null && artNum != null && !(await pendingArticleJob(payload, article.id, 'internal_link_inject'))) {
        await payload.create({
          collection: 'workflow-jobs',
          data: {
            label: `Internal links (publish): ${article.title ?? article.id}`.slice(0, 120),
            jobType: 'internal_link_inject',
            status: 'pending',
            site: siteNum,
            article: artNum,
            input: { reason: 'draft_to_published', articleId: article.id },
          },
        })
      }
    }

    const prevLife = prev?.lifecycleStage ?? undefined
    const nextLife = article.lifecycleStage ?? undefined
    if (
      nextLife &&
      nextLife !== prevLife &&
      (nextLife === 'merged' || nextLife === 'archived') &&
      !(await pendingArticleJob(payload, article.id, 'internal_link_rewrite'))
    ) {
      const siteId = relationId(article.site)
      const siteNum = numericId(siteId)
      const artNum = numericId(article.id)
      if (siteNum != null && artNum != null) {
        const mergeTargetId = nextLife === 'merged' ? relationId(article.mergedInto) : null
        await payload.create({
          collection: 'workflow-jobs',
          data: {
            label: `Link rewrite (${nextLife}): ${article.title ?? article.id}`.slice(0, 120),
            jobType: 'internal_link_rewrite',
            status: 'pending',
            site: siteNum,
            article: artNum,
            input: {
              reason: `lifecycle_${nextLife}`,
              articleId: article.id,
              mergeTargetArticleId: mergeTargetId,
            },
          },
        })
      }
    }
  } catch {
    // Never block saves on workflow enqueue failures
  }
}
