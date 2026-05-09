import type { Payload, Where } from 'payload'

import type { Config } from '@/payload-types'

/** Writing / Quick-win chain job types included in one-click scoped drain (excludes unrelated pending on same brief). */
export const PIPELINE_WRITING_SCOPE_JOB_TYPES = [
  'brief_generate',
  'draft_skeleton',
  'draft_section',
  'draft_finalize',
  'image_generate',
] as const

export type WritingScopeResolveInput = {
  articleId?: number | null
  briefId?: number | null
}

export type ResolvedWritingScopeIds = {
  articleId: number | null
  briefId: number | null
}

export type ResolveWritingScopeResult =
  | { ok: true; scope: ResolvedWritingScopeIds; error?: never }
  | { ok: false; error: string; scope?: never }

/**
 * Resolve numeric articleId / briefId for scope queries.
 * - If `articleId` is set: load article (with user access), set briefId from `sourceBrief` when present.
 * - If `briefId` is set: used when article is unknown (pre-article pipeline).
 * - If both set: briefId from body wins only when article has no sourceBrief; if article has sourceBrief, it must match body briefId or 400.
 */
export async function resolveWritingScope(
  payload: Payload,
  user: Config['user'],
  input: WritingScopeResolveInput,
): Promise<ResolveWritingScopeResult> {
  const rawArticle =
    typeof input.articleId === 'number' && Number.isFinite(input.articleId)
      ? Math.floor(input.articleId)
      : null
  const rawBrief =
    typeof input.briefId === 'number' && Number.isFinite(input.briefId)
      ? Math.floor(input.briefId)
      : null

  if (rawArticle == null && rawBrief == null) {
    return { ok: false, error: 'Provide articleId and/or briefId' }
  }

  let articleId: number | null = rawArticle
  let briefId: number | null = rawBrief

  if (rawArticle != null) {
    try {
      const art = await payload.findByID({
        collection: 'articles',
        id: String(rawArticle),
        depth: 0,
        user,
        overrideAccess: false,
      })
      if (!art) {
        return { ok: false, error: 'Article not found' }
      }
      const sb = (art as { sourceBrief?: number | { id: number } | null }).sourceBrief
      const fromArticle =
        sb == null ? null : typeof sb === 'number' ? sb : typeof sb === 'object' && 'id' in sb ? sb.id : null
      if (fromArticle != null && Number.isFinite(fromArticle)) {
        if (rawBrief != null && rawBrief !== fromArticle) {
          return { ok: false, error: 'briefId does not match article sourceBrief' }
        }
        briefId = fromArticle
      }
    } catch {
      return { ok: false, error: 'Article not found' }
    }
  }

  if (articleId == null && briefId == null) {
    return { ok: false, error: 'Could not resolve briefId or articleId' }
  }

  return { ok: true, scope: { articleId, briefId } }
}

export function buildWritingScopePendingWhere(articleId: number | null, briefId: number | null): Where | null {
  const or: Where[] = []
  if (articleId != null) {
    or.push({ article: { equals: articleId } })
  }
  if (briefId != null) {
    or.push({ contentBrief: { equals: briefId } })
  }
  if (or.length === 0) return null
  return {
    and: [
      { status: { equals: 'pending' } },
      { jobType: { in: [...PIPELINE_WRITING_SCOPE_JOB_TYPES] } },
      { or },
    ],
  }
}

export async function countWritingScopePending(
  payload: Payload,
  user: Config['user'],
  articleId: number | null,
  briefId: number | null,
): Promise<number> {
  const where = buildWritingScopePendingWhere(articleId, briefId)
  if (where == null) return 0
  const r = await payload.count({
    collection: 'workflow-jobs',
    where,
    overrideAccess: false,
    user,
  })
  return r.totalDocs
}

export async function listWritingScopePendingJobIds(
  payload: Payload,
  user: Config['user'],
  articleId: number | null,
  briefId: number | null,
  limit = 500,
): Promise<number[]> {
  const where = buildWritingScopePendingWhere(articleId, briefId)
  if (where == null) return []
  const r = await payload.find({
    collection: 'workflow-jobs',
    where,
    limit,
    sort: 'createdAt',
    depth: 0,
    overrideAccess: false,
    user,
  })
  return r.docs
    .map((d) => d.id)
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
}
