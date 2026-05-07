import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runNextPendingJobs } from '@/utilities/pipelineRunNext'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('runNextPendingJobs', () => {
  beforeEach(() => {
    process.env.PAYLOAD_SECRET = 'secret123'
  })

  it('stops with no_pending when tick returns executed false', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, executed: false, message: 'No pending jobs' }),
    )
    const r = await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 5,
      fetchImpl,
    })
    expect(r.stoppedReason).toBe('no_pending')
    expect(r.totalRuns).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const init = fetchImpl.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['x-internal-token']).toBe('secret123')
    expect(JSON.stringify(r)).not.toContain('secret123')
  })

  it('caps maxRuns at 20', async () => {
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      return jsonResponse({
        ok: true,
        executed: true,
        jobId: n,
        jobType: 'brief_generate',
        result: 'completed',
      })
    })
    const r = await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 21,
      fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(20)
    expect(r.stoppedReason).toBe('max_runs')
    expect(r.ok).toBe(true)
  })

  it('stops on failure when stopOnFailure is true', async () => {
    let c = 0
    const fetchImpl = vi.fn(async () => {
      c += 1
      if (c <= 2) {
        return jsonResponse({
          ok: true,
          executed: true,
          jobId: c,
          jobType: 'brief_generate',
          result: 'completed',
        })
      }
      return jsonResponse({
        ok: true,
        executed: true,
        jobId: 3,
        jobType: 'brief_generate',
        result: 'failed',
        output: { error: 'boom' },
      })
    })
    const r = await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 10,
      stopOnFailure: true,
      fetchImpl,
    })
    expect(r.stoppedReason).toBe('failure')
    expect(r.totalRuns).toBe(3)
    expect(r.ok).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('continues after failed tick when stopOnFailure is false', async () => {
    let c = 0
    const fetchImpl = vi.fn(async () => {
      c += 1
      if (c === 1) {
        return jsonResponse({
          ok: true,
          executed: true,
          jobId: 1,
          jobType: 'brief_generate',
          result: 'failed',
          output: { error: 'x' },
        })
      }
      return jsonResponse({
        ok: true,
        executed: true,
        jobId: c,
        jobType: 'draft_skeleton',
        result: 'completed',
      })
    })
    const r = await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 3,
      stopOnFailure: false,
      fetchImpl,
    })
    expect(r.ok).toBe(true)
    expect(r.stoppedReason).toBe('max_runs')
    expect(r.totalRuns).toBe(3)
  })

  it('stops early on budget (getNow hook)', async () => {
    let time = 0
    const getNow = vi.fn(() => time)
    const fetchImpl = vi.fn(async () => {
      time = 2100
      return jsonResponse({
        ok: true,
        executed: true,
        jobId: 1,
        jobType: 'brief_generate',
        result: 'completed',
      })
    })
    const r = await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 10,
      budgetMs: 4000,
      getNow,
      fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(r.stoppedReason).toBe('budget')
    expect(r.totalRuns).toBe(1)
  })

  it('sends constrainedJobIds in tick body when provided', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, executed: false, message: 'No pending jobs' }),
    )
    await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 2,
      constrainedJobIds: [7, 9],
      fetchImpl,
    })
    const init = fetchImpl.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({
      execute: true,
      constrainedJobIds: [7, 9],
    })
  })

  it('stops on non-OK HTTP when stopOnFailure is true', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401))
    const r = await runNextPendingJobs({
      origin: 'http://localhost:3000',
      maxRuns: 5,
      fetchImpl,
    })
    expect(r.stoppedReason).toBe('failure')
    expect(r.ok).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
