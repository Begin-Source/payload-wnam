import type { Where } from 'payload'

/** Max IDs passed through admin run-next / internal tick constraint (truncate with `truncated: true`). */
export const MAX_CONSTRAINED_WORKFLOW_JOB_IDS = 500

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
