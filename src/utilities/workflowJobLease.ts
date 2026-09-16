import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { d1ClientFromPayload, type D1Client } from './d1NarrowUpdate'

export const WORKFLOW_LEASE_MS = 180_000
export const WORKFLOW_HEARTBEAT_MS = 30_000
export const RUNNER_RECOVERABLE_CODES = ['RUNNER_UPSTREAM_BLOCKED', 'RUNNER_INTERRUPTED'] as const

export class WorkflowLeaseLostError extends Error {
  constructor() { super('Workflow lease is no longer owned by this invocation') }
}

export type WorkflowLease = {
  id: string | number
  token: string
  client: D1Client
  lost: boolean
}

async function execute(client: D1Client, sql: string, values: unknown[]): Promise<number> {
  const result = await client.prepare(sql).bind(...values).run() as {
    success?: boolean; meta?: { changes?: number }
  }
  if (result.success === false || typeof result.meta?.changes !== 'number') {
    throw new Error('D1 did not confirm the workflow lease operation')
  }
  return result.meta.changes
}

function clientFor(payload: Payload): D1Client {
  const client = d1ClientFromPayload(payload)
  if (!client) throw new Error('Workflow execution requires the D1 lease store')
  return client
}

/** Single conditional UPDATE is the ownership boundary for every execution entry point. */
export async function claimWorkflowJob(
  payload: Payload,
  id: string | number,
  options: { runner?: boolean; now?: number } = {},
): Promise<WorkflowLease | null> {
  const now = options.now ?? Date.now()
  const timestamp = new Date(now).toISOString()
  const expires = new Date(now + WORKFLOW_LEASE_MS).toISOString()
  const legacyCutoff = new Date(now - 5 * 60_000).toISOString()
  const client = clientFor(payload)
  const token = randomUUID()
  const eligible = options.runner
    ? `(status = 'pending' OR (status = 'running' AND
        ((lease_expires_at IS NOT NULL AND lease_expires_at <= ?) OR
         (lease_expires_at IS NULL AND updated_at < ?))) OR
       (status = 'failed' AND (error_code IN ('RUNNER_UPSTREAM_BLOCKED', 'RUNNER_INTERRUPTED') OR
         error_message LIKE '%error code: 1003%' OR error_message LIKE '%tick 返回非 JSON（403）%')))`
    : `status = 'pending'`
  const runnerScope = options.runner
    ? `AND NOT EXISTS (SELECT 1 FROM workflow_jobs active
        WHERE active.site_id = workflow_jobs.site_id AND active.id <> workflow_jobs.id
          AND active.job_type = 'site_content_runner' AND active.status = 'running'
          AND (active.lease_expires_at > ? OR (active.lease_expires_at IS NULL AND active.updated_at >= ?)))`
    : ''
  const changes = await execute(client,
    `UPDATE workflow_jobs SET status = 'running', lease_token = ?, lease_expires_at = ?,
      heartbeat_at = ?, started_at = ?, updated_at = ?,
      attempt_count = COALESCE(attempt_count, 0) + 1, error_code = NULL, error_message = ''
     WHERE id = ? AND ${eligible} ${options.runner ? "AND job_type = 'site_content_runner'" : ''} ${runnerScope}`,
    [token, expires, timestamp, timestamp, timestamp, id,
      ...(options.runner ? [timestamp, legacyCutoff, timestamp, legacyCutoff] : [])],
  )
  return changes === 1 ? { id, token, client, lost: false } : null
}

export async function heartbeatWorkflowLease(lease: WorkflowLease, now = Date.now()): Promise<void> {
  if (lease.lost) throw new WorkflowLeaseLostError()
  const changed = await execute(lease.client,
    'UPDATE workflow_jobs SET lease_expires_at = ?, heartbeat_at = ? WHERE id = ? AND lease_token = ? AND lease_expires_at > ?',
    [new Date(now + WORKFLOW_LEASE_MS).toISOString(), new Date(now).toISOString(), lease.id, lease.token, new Date(now).toISOString()],
  )
  if (changed !== 1) {
    lease.lost = true
    throw new WorkflowLeaseLostError()
  }
}

export function startWorkflowHeartbeat(lease: WorkflowLease): () => void {
  let pending = false
  const timer = setInterval(() => {
    if (pending || lease.lost) return
    pending = true
    void heartbeatWorkflowLease(lease).catch(() => { lease.lost = true }).finally(() => { pending = false })
  }, WORKFLOW_HEARTBEAT_MS)
  return () => clearInterval(timer)
}

const patchColumns: Record<string, { column: string; json?: boolean }> = {
  status: { column: 'status' },
  startedAt: { column: 'started_at' },
  completedAt: { column: 'completed_at' },
  errorMessage: { column: 'error_message' },
  errorCode: { column: 'error_code' },
  output: { column: 'output', json: true },
  handoff: { column: 'handoff', json: true },
}

/** A stale invocation can never overwrite the new owner's progress or result. */
export async function patchLeasedWorkflowJob(lease: WorkflowLease, data: Record<string, unknown>): Promise<void> {
  if (lease.lost) throw new WorkflowLeaseLostError()
  const entries = Object.entries(data).filter(([, value]) => value !== undefined)
  if (!entries.length) return
  const columns = entries.map(([key]) => {
    const spec = patchColumns[key]
    if (!spec) throw new Error(`Unsupported workflow progress field: ${key}`)
    return spec
  })
  const now = new Date().toISOString()
  const values = entries.map(([, value], index) => columns[index].json && value != null ? JSON.stringify(value) : value)
  const changed = await execute(lease.client,
    `UPDATE workflow_jobs SET ${columns.map(spec => spec.column + ' = ?').join(', ')}, updated_at = ?
     WHERE id = ? AND lease_token = ? AND lease_expires_at > ?`,
    [...values, now, lease.id, lease.token, now],
  )
  if (changed !== 1) {
    lease.lost = true
    throw new WorkflowLeaseLostError()
  }
}

export async function releaseWorkflowLease(lease: WorkflowLease): Promise<void> {
  await execute(lease.client,
    `UPDATE workflow_jobs SET lease_token = NULL,
       lease_expires_at = CASE WHEN status = 'running' THEN ? ELSE NULL END
     WHERE id = ? AND lease_token = ?`,
    [new Date().toISOString(), lease.id, lease.token],
  )
}

/** Recover expired ordinary jobs before runners search for pending work. */
export async function recoverExpiredWorkflowJobs(payload: Payload): Promise<number> {
  return execute(clientFor(payload),
    `UPDATE workflow_jobs SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
       error_code = 'LEASE_EXPIRED', updated_at = ?
     WHERE id IN (SELECT id FROM workflow_jobs WHERE status = 'running'
       AND job_type <> 'site_content_runner' AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= ? ORDER BY lease_expires_at LIMIT 100)`,
    [new Date().toISOString(), new Date().toISOString()],
  )
}

export function runnerFailureCode(message: string): string {
  return message.includes('error code: 1003') || message.includes('tick 返回非 JSON（403）')
    ? 'RUNNER_UPSTREAM_BLOCKED' : 'RUNNER_FAILURE'
}

/** Manual recovery also uses CAS and never steals a live lease, including force requests. */
export async function recoverUnleasedWorkflowJob(
  payload: Payload, id: string | number, data: Record<string, unknown>, force = false,
): Promise<boolean> {
  const now = Date.now()
  const entries = Object.entries(data).filter(([, value]) => value !== undefined)
  const columns = entries.map(([key]) => {
    const column = patchColumns[key]
    if (!column) throw new Error(`Unsupported recovery field: ${key}`)
    return column
  })
  const changed = await execute(clientFor(payload),
    `UPDATE workflow_jobs SET ${columns.map(column => column.column + ' = ?').join(', ')},
      lease_token = NULL, lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND status = 'running' AND
       (lease_expires_at <= ? OR (lease_token IS NULL AND (? = 1 OR updated_at < ?)))`,
    [...entries.map(([, value], i) => columns[i].json && value != null ? JSON.stringify(value) : value),
      new Date(now).toISOString(), id, new Date(now).toISOString(), force ? 1 : 0, new Date(now - 5 * 60_000).toISOString()],
  )
  return changed === 1
}
