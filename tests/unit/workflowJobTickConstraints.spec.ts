import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  buildPendingConstrainedWhere,
  expandConstrainedWorkflowJobIdsForPipeline,
  MAX_CONSTRAINED_WORKFLOW_JOB_IDS,
  normalizeConstrainedJobIds,
  parseConstrainedIdsFromCommaQuery,
} from '@/utilities/workflowJobTickConstraints'

describe('normalizeConstrainedJobIds', () => {
  it('returns empty for null/undefined', () => {
    expect(normalizeConstrainedJobIds(null)).toEqual({ ok: true, ids: [], truncated: false })
    expect(normalizeConstrainedJobIds(undefined)).toEqual({ ok: true, ids: [], truncated: false })
  })

  it('rejects non-array non-scalar', () => {
    const r = normalizeConstrainedJobIds({ a: 1 })
    expect(r.ok).toBe(false)
  })

  it('dedupes and coerces integer strings', () => {
    const r = normalizeConstrainedJobIds([1, '1', 2, ' 2 '])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ids).toEqual([1, 2])
      expect(r.truncated).toBe(false)
    }
  })

  it('sets truncated when more unique ids than cap', () => {
    const many = Array.from({ length: MAX_CONSTRAINED_WORKFLOW_JOB_IDS + 5 }, (_, i) => i + 1)
    const r = normalizeConstrainedJobIds(many)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ids.length).toBe(MAX_CONSTRAINED_WORKFLOW_JOB_IDS)
      expect(r.truncated).toBe(true)
    }
  })

  it('does not set truncated when only duplicates remain after cap', () => {
    const base = Array.from({ length: MAX_CONSTRAINED_WORKFLOW_JOB_IDS }, (_, i) => i + 1)
    const r = normalizeConstrainedJobIds([...base, ...base])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ids.length).toBe(MAX_CONSTRAINED_WORKFLOW_JOB_IDS)
      expect(r.truncated).toBe(false)
    }
  })
})

describe('parseConstrainedIdsFromCommaQuery', () => {
  it('parses comma list', () => {
    const r = parseConstrainedIdsFromCommaQuery('10, 20 ,20')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ids).toEqual([10, 20])
  })
})

describe('buildPendingConstrainedWhere', () => {
  it('returns global pending when ids empty', () => {
    expect(buildPendingConstrainedWhere([])).toEqual({ status: { equals: 'pending' } })
  })

  it('adds id in when constrained', () => {
    expect(buildPendingConstrainedWhere([1, 2])).toEqual({
      and: [{ status: { equals: 'pending' } }, { id: { in: [1, 2] } }],
    })
  })
})

describe('expandConstrainedWorkflowJobIdsForPipeline', () => {
  const user = { id: 1, collection: 'users' } as never

  it('returns seeds unchanged when no numeric ids (no DB calls)', async () => {
    const find = vi.fn()
    const payload = { find } as unknown as Payload
    const r = await expandConstrainedWorkflowJobIdsForPipeline(payload, user, ['not-a-number'])
    expect(r).toEqual({ ids: ['not-a-number'], truncated: false })
    expect(find).not.toHaveBeenCalled()
  })

  it('merges pending children via parentJob and stabilizes', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 10, article: 100 }] })
      .mockResolvedValueOnce({ docs: [{ id: 1, article: 100 }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 1, article: 100 }, { id: 10, article: 100 }] })
      .mockResolvedValueOnce({ docs: [] })

    const payload = { find } as unknown as Payload
    const r = await expandConstrainedWorkflowJobIdsForPipeline(payload, user, [1])
    expect(r.ids).toEqual([1, 10])
    expect(r.truncated).toBe(false)
    expect(find).toHaveBeenCalledTimes(6)
  })

  it('pulls same-article pending draft_section without parentJob', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 1, article: 100 }] })
      .mockResolvedValueOnce({ docs: [{ id: 20, article: 100 }] })
      .mockResolvedValueOnce({ docs: [{ id: 20, article: 100 }] })
      .mockResolvedValueOnce({ docs: [{ id: 1, article: 100 }, { id: 20, article: 100 }] })
      .mockResolvedValueOnce({ docs: [] })

    const payload = { find } as unknown as Payload
    const r = await expandConstrainedWorkflowJobIdsForPipeline(payload, user, [1])
    expect(r.ids).toEqual([1, 20])
    expect(find).toHaveBeenCalledTimes(6)
  })
})
