import type { Where } from 'payload'
import { RUNNER_RECOVERABLE_CODES } from './workflowJobLease'

/** Apply eligibility before LIMIT so terminal failures cannot starve pending runners. */
export function runnerRecoveryWhere(now = Date.now()): Where {
  return {
    and: [
      { jobType: { equals: 'site_content_runner' } },
      { or: [
        { status: { equals: 'pending' } },
        { and: [
          { status: { equals: 'running' } },
          { or: [
            { leaseExpiresAt: { less_than_equal: new Date(now).toISOString() } },
            { and: [
              { leaseExpiresAt: { exists: false } },
              { updatedAt: { less_than: new Date(now - 5 * 60_000).toISOString() } },
            ] },
          ] },
        ] },
        { and: [
          { status: { equals: 'failed' } },
          { or: [
            { errorCode: { in: [...RUNNER_RECOVERABLE_CODES] } },
            { errorMessage: { contains: 'error code: 1003' } },
            { errorMessage: { contains: 'tick 返回非 JSON（403）' } },
          ] },
        ] },
      ] },
    ],
  }
}
