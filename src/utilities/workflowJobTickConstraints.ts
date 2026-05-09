import type { Payload, Where } from 'payload'

import type { Config } from '@/payload-types'

/** Max IDs passed through admin run-next / internal tick constraint (truncate with `truncated: true`). */
export const MAX_CONSTRAINED_WORKFLOW_JOB_IDS = 500

/** Pending `draft_section` / `draft_finalize` / `image_generate` linked by shared `article` after parent closure (wave-2 sections without `parentJob`). */
const PIPELINE_CHAIN_ARTICLE_JOB_TYPES = [
  'draft_section',
  'draft_finalize',
  'image_generate',
] as const

const PIPELINE_EXPAND_MAX_ROUNDS = 24

function coerceWorkflowJobIdToNumber(raw: string | number): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw)
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!/^-?\d+$/.test(t)) return null
    const n = Number(t)
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}

function extractArticleIdFromJobDoc(doc: unknown): number | null {
  if (typeof doc !== 'object' || doc === null || !('article' in doc)) return null
  const a = (doc as { article?: unknown }).article
  if (a == null) return null
  if (typeof a === 'number' && Number.isFinite(a)) {
    return Math.trunc(a)
  }
  if (typeof a === 'object' && a !== null && 'id' in a) {
    const id = (a as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) {
      return Math.trunc(id)
    }
  }
  return null
}

export type ExpandConstrainedWorkflowJobIdsResult = {
  /** Job ids for `id in (...)` tick / peek (includes completed seeds; tick still filters `pending`). */
  ids: (string | number)[]
  truncated: boolean
}

/**
 * When staff selects workflow job rows and runs Pipeline with "selected only", enqueue may add **new**
 * `draft_*` / `image_generate` jobs whose ids were not in the UI selection. This expands the constraint
 * set to pending children (`parentJob`), then pending chain types that share the same `article` as any job
 * already in scope (covers second-wave `draft_section` rows that omit `parentJob`).
 */
export async function expandConstrainedWorkflowJobIdsForPipeline(
  payload: Payload,
  user: Config['user'],
  seedIds: (string | number)[],
): Promise<ExpandConstrainedWorkflowJobIdsResult> {
  const scope = new Set<number>()
  for (const raw of seedIds) {
    const n = coerceWorkflowJobIdToNumber(raw)
    if (n != null && scope.size < MAX_CONSTRAINED_WORKFLOW_JOB_IDS) {
      scope.add(n)
    }
  }

  if (scope.size === 0 && seedIds.length > 0) {
    return { ids: [...seedIds], truncated: false }
  }

  let truncated = false

  for (let round = 0; round < PIPELINE_EXPAND_MAX_ROUNDS; round += 1) {
    const sizeBefore = scope.size
    if (scope.size >= MAX_CONSTRAINED_WORKFLOW_JOB_IDS) {
      truncated = true
      break
    }

    const scopeArr = [...scope]

    const pendingLinked = await payload.find({
      collection: 'workflow-jobs',
      where: {
        and: [
          { status: { equals: 'pending' } },
          {
            or: [{ id: { in: scopeArr } }, { parentJob: { in: scopeArr } }],
          },
        ],
      },
      limit: MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
      sort: 'createdAt',
      depth: 0,
      overrideAccess: false,
      user,
    })

    for (const d of pendingLinked.docs) {
      if (typeof d.id !== 'number' || !Number.isFinite(d.id)) continue
      const id = Math.trunc(d.id)
      if (scope.size >= MAX_CONSTRAINED_WORKFLOW_JOB_IDS && !scope.has(id)) {
        truncated = true
        break
      }
      scope.add(id)
    }
    if (truncated) break

    const scopeForDocs = [...scope].slice(0, MAX_CONSTRAINED_WORKFLOW_JOB_IDS)
    const docsInScope = await payload.find({
      collection: 'workflow-jobs',
      where: { id: { in: scopeForDocs } },
      limit: scopeForDocs.length,
      depth: 0,
      overrideAccess: false,
      user,
    })

    const articleIds = new Set<number>()
    for (const d of docsInScope.docs) {
      const aid = extractArticleIdFromJobDoc(d)
      if (aid != null) articleIds.add(aid)
    }

    if (articleIds.size > 0) {
      const artArr = [...articleIds]
      const pendingByArticle = await payload.find({
        collection: 'workflow-jobs',
        where: {
          and: [
            { status: { equals: 'pending' } },
            { article: { in: artArr } },
            { jobType: { in: [...PIPELINE_CHAIN_ARTICLE_JOB_TYPES] } },
          ],
        },
        limit: MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
        sort: 'createdAt',
        depth: 0,
        overrideAccess: false,
        user,
      })

      for (const d of pendingByArticle.docs) {
        if (typeof d.id !== 'number' || !Number.isFinite(d.id)) continue
        const id = Math.trunc(d.id)
        if (scope.size >= MAX_CONSTRAINED_WORKFLOW_JOB_IDS && !scope.has(id)) {
          truncated = true
          break
        }
        scope.add(id)
      }
    }

    if (truncated) break
    if (scope.size === sizeBefore) break
  }

  const sorted = [...scope].sort((a, b) => a - b)
  if (sorted.length > MAX_CONSTRAINED_WORKFLOW_JOB_IDS) {
    return {
      ids: sorted.slice(0, MAX_CONSTRAINED_WORKFLOW_JOB_IDS),
      truncated: true,
    }
  }
  return { ids: sorted, truncated }
}

export type NormalizeConstrainedJobIdsResult =
  | { ok: true; ids: (string | number)[]; truncated: boolean }
  | { ok: false; error: string }

function keyForConstrainedJobId(value: string | number): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.trunc(value))
    : String(value)
}

/** Normalize + dedupe job ids for tick / run-next; truncates to {@link MAX_CONSTRAINED_WORKFLOW_JOB_IDS}. */
export function normalizeConstrainedJobIds(raw: unknown): NormalizeConstrainedJobIdsResult {
  if (raw == null) {
    return { ok: true, ids: [], truncated: false }
  }
  let list: unknown[]
  if (Array.isArray(raw)) {
    list = raw
  } else if (typeof raw === 'number' || typeof raw === 'string') {
    list = [raw]
  } else {
    return { ok: false, error: 'Invalid job id list (expected an array of numeric or string ids)' }
  }
  const seen = new Set<string>()
  const ids: (string | number)[] = []
  let truncated = false
  for (const x of list) {
    let candidate: string | number | null = null
    if (typeof x === 'number' && Number.isFinite(x)) {
      candidate = Math.trunc(x)
    } else if (typeof x === 'string') {
      const t = x.trim()
      if (!t) continue
      if (/^-?\d+$/.test(t)) {
        const n = Number(t)
        candidate = Number.isSafeInteger(n) ? n : null
      } else {
        candidate = t
      }
    }
    if (candidate === null || (typeof candidate === 'string' && candidate === '')) continue

    const k = keyForConstrainedJobId(candidate)
    if (seen.has(k)) continue

    if (ids.length >= MAX_CONSTRAINED_WORKFLOW_JOB_IDS) {
      truncated = true
      break
    }
    seen.add(k)
    ids.push(
      typeof candidate === 'number' && Number.isFinite(candidate) ? Math.trunc(candidate) : candidate,
    )
  }
  return { ok: true, ids, truncated }
}

/** Parse comma-separated ids from query string (e.g. `?ids=1,2,3`). */
export function parseConstrainedIdsFromCommaQuery(param: string | null): NormalizeConstrainedJobIdsResult {
  if (param == null || param.trim() === '') {
    return { ok: true, ids: [], truncated: false }
  }
  const parts = param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return normalizeConstrainedJobIds(parts)
}

/** `pending` optionally scoped to id `in` list; empty list = global pending only. */
export function buildPendingConstrainedWhere(constrainedIds: (string | number)[]): Where {
  const pending: Where = { status: { equals: 'pending' } }
  if (constrainedIds.length === 0) return pending
  return {
    and: [pending, { id: { in: constrainedIds } }],
  }
}
