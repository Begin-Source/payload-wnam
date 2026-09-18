import { z } from 'zod'
import { provisionHashSchema,provisionUuidSchema } from './provisionPlan'

const dispatchMessageSchema = z.object({
  type: z.literal('site.provision.dispatch'),requestId: provisionUuidSchema,inputDigest: provisionHashSchema,
  buildBranch: z.string().min(1).max(255),
}).strict()
export type ProvisionDispatchMessage = z.infer<typeof dispatchMessageSchema>

const buildEventType = z.enum([
  'cf.workersBuilds.worker.build.started','cf.workersBuilds.worker.build.failed',
  'cf.workersBuilds.worker.build.canceled','cf.workersBuilds.worker.build.succeeded',
])
const buildEventSchema = z.object({
  type: buildEventType,
  source: z.object({ type: z.literal('workersBuilds.worker'),workerName: z.string().min(1) }).passthrough(),
  payload: z.object({
    buildUuid: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),status: z.string().min(1),buildOutcome: z.string().nullable(),
    buildTriggerMetadata: z.object({ buildTriggerSource: z.string().min(1),branch: z.string().min(1),commitHash: z.string().regex(/^(?:[a-f0-9]{7,64})?$/),
      repoName: z.string().min(1),providerAccountName: z.string().min(1),providerType: z.literal('github') }).passthrough(),
  }).passthrough(),
  metadata: z.object({ accountId: z.string().regex(/^[a-f0-9]{32}$/),eventSubscriptionId: z.string().min(8),
    eventSchemaVersion: z.literal(1),eventTimestamp: z.string().datetime({ offset: true }) }).passthrough(),
}).passthrough()
export type ProvisionBuildEvent = z.infer<typeof buildEventSchema>
export type ProvisionQueueMessage = ProvisionDispatchMessage | ProvisionBuildEvent

const buildExecutionSchema = z.object({
  buildUuid: z.string().uuid(),branch: z.string().min(1).max(255),commit: z.string().regex(/^[a-f0-9]{40}$/),
}).strict()

const dispatchRecoverySchema = z.object({
  recoveryId: provisionUuidSchema,requestId: provisionUuidSchema,buildUuid: z.string().uuid(),attemptCount: z.number().int().positive(),
  reason: z.string().regex(/^[a-z0-9_]{3,100}$/),reviewedAt: z.string().datetime({ offset: true }),
  evidence: z.object({ status: z.literal('stopped'),outcome: z.literal('fail'),triggerSource: z.literal('deploy_hook'),
    branch: z.literal('feat/site-per-d1') }).strict(),
}).strict()

export type ProvisionDispatchEnvironment = {
  CENTRAL_D1: D1Database
  PROVISION_DISPATCH_QUEUE: Queue<ProvisionQueueMessage>
  PROVISION_DEPLOY_HOOK_URL: string
  PROVISION_BUILD_ACCOUNT_ID: string
  PROVISION_BUILD_EVENT_SUBSCRIPTION_ID: string
  PROVISION_BUILD_WORKER: string
  PROVISION_BUILD_BRANCH: string
  PROVISION_BUILD_REPOSITORY: string
  PROVISION_BUILD_REPOSITORY_OWNER: string
}

type DispatchRow = { state: string; inputDigest: string; buildUuid: string | null }
const timestamp = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2,'0')).join('')
}

function requireHook(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Provision deploy hook unavailable') }
  if (url.protocol !== 'https:' || url.hostname !== 'api.cloudflare.com' ||
    !/^\/client\/v4\/workers\/builds\/deploy_hooks\/[A-Za-z0-9_-]+$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('Provision deploy hook unavailable')
  }
  return url.toString()
}

/** The D1 row stays queued until Queue accepts the message. Repeated cron
 * messages are harmless because only one conditional claim can enter the
 * active slot. */
export async function enqueueProvisionDispatch(database: D1Database,queue: Queue<ProvisionQueueMessage>) {
  const row = await database.prepare(`SELECT d.request_id AS requestId,d.input_digest AS inputDigest,d.build_branch AS buildBranch
    FROM site_provision_dispatch_runs d JOIN site_provision_requests q ON q.request_id=d.request_id
    WHERE d.state='queued' AND (q.state='queued' OR (q.state='provisioning' AND EXISTS
      (SELECT 1 FROM site_provision_operations o WHERE o.operation_id=q.request_id
        AND o.checkpoint=6 AND o.completed_at IS NOT NULL)))
      AND q.actor_user_id=7 AND q.owner_user_id=7 AND q.tenant_id IN (1,2)
      AND NOT EXISTS (SELECT 1 FROM site_provision_dispatch_runs active
        WHERE active.state IN ('triggering_unknown','dispatched','running','needs_review'))
    ORDER BY d.queued_at,d.request_id LIMIT 1`).first<{ requestId: string; inputDigest: string; buildBranch: string }>()
  if (!row) return null
  const body = dispatchMessageSchema.parse({ type: 'site.provision.dispatch',...row })
  await queue.send(body,{ contentType: 'json' })
  return body
}

async function readDispatch(database: D1Database,requestId: string) {
  return database.prepare(`SELECT state,input_digest AS inputDigest,build_uuid AS buildUuid
    FROM site_provision_dispatch_runs WHERE request_id=?`).bind(requestId).first<DispatchRow>()
}

/** Select only the admission explicitly bound to this Cloudflare build. Push
 * builds and unrelated Hook builds have no matching UUID and remain read-only.
 * P1 automatic acceptance is intentionally limited to its synthetic account. */
export async function selectProvisionBuildExecution(database: D1Database,value: unknown) {
  const build = buildExecutionSchema.parse(value)
  const row = await database.prepare(`SELECT r.request_id AS requestId,r.input_digest AS inputDigest,
      r.build_branch AS buildBranch,r.state,r.build_commit AS buildCommit,
      q.actor_user_id AS actorUserId,q.owner_user_id AS ownerUserId,q.tenant_id AS tenantId,q.state AS requestState
    FROM site_provision_dispatch_runs r JOIN site_provision_requests q ON q.request_id=r.request_id
    WHERE r.build_uuid=?`).bind(build.buildUuid).first<{ requestId: string; inputDigest: string; buildBranch: string;
      state: string; buildCommit: string | null; actorUserId: number; ownerUserId: number; tenantId: number; requestState: string }>()
  if (!row) return null
  if (row.buildBranch !== build.branch || !['dispatched','running','needs_review','succeeded'].includes(row.state) ||
    !['queued','provisioning','completed'].includes(row.requestState) || row.actorUserId !== 7 || row.ownerUserId !== 7 ||
    ![1,2].includes(row.tenantId) || row.buildCommit && row.buildCommit !== build.commit) {
    throw new Error('Provision build execution identity mismatch')
  }
  const saved = await database.prepare(`UPDATE site_provision_dispatch_runs SET build_commit=COALESCE(build_commit,?)
    WHERE request_id=? AND build_uuid=? AND build_branch=? AND (build_commit IS NULL OR build_commit=?)`)
    .bind(build.commit,row.requestId,build.buildUuid,build.branch,build.commit).run()
  if (saved.meta.changes !== 1) throw new Error('Provision build execution could not be claimed')
  return { requestId: row.requestId,inputDigest: row.inputDigest,state: row.state,requestState: row.requestState,
    buildUuid: build.buildUuid,branch: build.branch,commit: build.commit }
}

/** A retry is a reviewed maintenance action. Archive the complete prior build
 * identity before clearing the active slot; the immutable trigger permits only
 * that exact atomic transition. Replays return the existing recovery receipt. */
export async function recoverProvisionDispatch(database: D1Database,value: unknown) {
  const recovery = dispatchRecoverySchema.parse(value)
  const archived = await database.prepare(`SELECT request_id AS requestId,attempt_count AS attemptCount
    FROM site_provision_dispatch_attempts WHERE recovery_id=?`).bind(recovery.recoveryId)
    .first<{ requestId: string; attemptCount: number }>()
  if (archived) {
    if (archived.requestId !== recovery.requestId || archived.attemptCount !== recovery.attemptCount) {
      throw new Error('Provision dispatch recovery identity conflict')
    }
    const current = await readDispatch(database,recovery.requestId)
    if (!current || current.buildUuid === recovery.buildUuid) throw new Error('Provision dispatch recovery replay mismatch')
    return { ...recovery,replayed: true as const }
  }
  const row = await database.prepare(`SELECT r.request_id AS requestId,r.attempt_count AS attemptCount,r.attempt_id AS attemptId,
      r.build_uuid AS buildUuid,r.build_commit AS buildCommit,r.build_outcome AS buildOutcome,r.state,
      r.trigger_started_at AS triggerStartedAt,r.dispatched_at AS dispatchedAt,r.running_at AS runningAt,
      r.completed_at AS completedAt,q.state AS requestState
    FROM site_provision_dispatch_runs r JOIN site_provision_requests q ON q.request_id=r.request_id
    WHERE r.request_id=? AND r.build_uuid=?`).bind(recovery.requestId,recovery.buildUuid).first<{
      requestId: string; attemptCount: number; attemptId: string | null; buildUuid: string; buildCommit: string | null;
      buildOutcome: string | null; state: string; triggerStartedAt: string | null; dispatchedAt: string | null;
      runningAt: string | null; completedAt: string | null; requestState: string
    }>()
  const completed = row?.requestState === 'provisioning' ? Boolean(await database.prepare(
    'SELECT 1 FROM site_provision_operations WHERE operation_id=? AND checkpoint=6 AND completed_at IS NOT NULL')
    .bind(recovery.requestId).first()) : false
  if (!row || row.attemptCount !== recovery.attemptCount || !row.attemptId || !row.triggerStartedAt ||
    !['dispatched','running','needs_review'].includes(row.state) || row.requestState !== 'queued' && !completed) {
    throw new Error('Provision dispatch is not eligible for reviewed recovery')
  }
  const results = await database.batch([
    database.prepare(`INSERT INTO site_provision_dispatch_attempts
      (request_id,attempt_count,attempt_id,build_uuid,build_commit,build_outcome,dispatch_state,trigger_started_at,
       dispatched_at,running_at,completed_at,recovery_id,recovery_reason,recovery_evidence_status,recovery_evidence_outcome,
       recovery_trigger_source,reviewed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.requestId,row.attemptCount,row.attemptId,row.buildUuid,row.buildCommit,
        row.buildOutcome,row.state,row.triggerStartedAt,row.dispatchedAt,row.runningAt,row.completedAt,recovery.recoveryId,
        recovery.reason,recovery.evidence.status,recovery.evidence.outcome,recovery.evidence.triggerSource,recovery.reviewedAt),
    database.prepare(`UPDATE site_provision_dispatch_runs SET state='queued',attempt_id=NULL,build_uuid=NULL,build_commit=NULL,
      build_outcome=NULL,trigger_started_at=NULL,dispatched_at=NULL,running_at=NULL,completed_at=NULL,last_error_code=NULL
      WHERE request_id=? AND build_uuid=? AND attempt_count=? AND state IN ('dispatched','running','needs_review')`)
      .bind(recovery.requestId,recovery.buildUuid,recovery.attemptCount),
  ])
  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) throw new Error('Provision dispatch recovery was not committed')
  return { ...recovery,replayed: false as const }
}

/** Claim before the non-idempotent POST. Any response loss leaves an explicit
 * unknown result and must never cause an automatic second POST. */
export async function triggerProvisionBuild(database: D1Database,message: ProvisionDispatchMessage,hook: string,
  fetcher: typeof fetch = fetch) {
  const input = dispatchMessageSchema.parse(message),attemptId = crypto.randomUUID(),hookUrl = requireHook(hook)
  const claimed = await database.prepare(`UPDATE site_provision_dispatch_runs SET state='triggering_unknown',attempt_id=?,
    attempt_count=attempt_count+1,trigger_started_at=${timestamp},last_error_code='hook_result_unknown'
    WHERE request_id=? AND input_digest=? AND state='queued'
      AND EXISTS (SELECT 1 FROM site_provision_requests q WHERE q.request_id=? AND
        (q.state='queued' OR (q.state='provisioning' AND EXISTS
          (SELECT 1 FROM site_provision_operations o WHERE o.operation_id=q.request_id
            AND o.checkpoint=6 AND o.completed_at IS NOT NULL))))
      AND build_branch=? AND NOT EXISTS (SELECT 1 FROM site_provision_dispatch_runs active WHERE active.request_id!=?
        AND active.state IN ('triggering_unknown','dispatched','running','needs_review'))`)
    .bind(attemptId,input.requestId,input.inputDigest,input.requestId,input.buildBranch,input.requestId).run()
  if (claimed.meta.changes !== 1) {
    const current = await readDispatch(database,input.requestId)
    if (!current || current.inputDigest !== input.inputDigest) throw new Error('Provision dispatch identity unavailable')
    return { state: current.state,buildUuid: current.buildUuid,triggered: false as const }
  }
  try {
    const response = await fetcher(hookUrl,{ method: 'POST',signal: AbortSignal.timeout(20000) })
    const body = await response.json() as { success?: unknown; result?: { build_uuid?: unknown; branch?: unknown } }
    const buildUuid = typeof body.result?.build_uuid === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(body.result.build_uuid) ? body.result.build_uuid : null
    if (!response.ok || body.success !== true || !buildUuid) throw new Error('Deploy hook response unavailable')
    if (typeof body.result?.branch === 'string' && body.result.branch !== input.buildBranch) throw new Error('Deploy hook branch mismatch')
    const saved = await database.prepare(`UPDATE site_provision_dispatch_runs SET build_uuid=?,
      state=CASE WHEN state='triggering_unknown' THEN 'dispatched' ELSE state END,dispatched_at=COALESCE(dispatched_at,${timestamp}),
      last_error_code=NULL WHERE request_id=? AND attempt_id=? AND (build_uuid IS NULL OR build_uuid=?)`)
      .bind(buildUuid,input.requestId,attemptId,buildUuid).run()
    if (saved.meta.changes !== 1) throw new Error('Deploy hook identity could not be persisted')
    return { state: 'dispatched',buildUuid,triggered: true as const }
  } catch {
    // The POST may have created a build. Preserve the pre-POST unknown state;
    // queue retries must acknowledge this message instead of posting again.
    return { state: 'triggering_unknown',buildUuid: null,triggered: true as const }
  }
}

function eventName(type: ProvisionBuildEvent['type']) {
  return type.slice(type.lastIndexOf('.')+1) as 'started' | 'failed' | 'canceled' | 'succeeded'
}

function validateEvent(event: ProvisionBuildEvent,env: ProvisionDispatchEnvironment) {
  const metadata = event.payload.buildTriggerMetadata
  const states: { status: readonly string[]; outcome: readonly (string | null)[] } = {
    started: { status: ['started','queued','running','building'],outcome: [null] },
    succeeded: { status: ['success','succeeded','stopped'],outcome: ['success'] },
    failed: { status: ['fail','failed','failure','stopped'],outcome: ['fail','failure'] },
    canceled: { status: ['cancelled','canceled','stopped'],outcome: ['cancelled','canceled'] },
  }[eventName(event.type)]
  if (event.metadata.accountId !== env.PROVISION_BUILD_ACCOUNT_ID ||
    event.metadata.eventSubscriptionId !== env.PROVISION_BUILD_EVENT_SUBSCRIPTION_ID ||
    event.source.workerName !== env.PROVISION_BUILD_WORKER || metadata.branch !== env.PROVISION_BUILD_BRANCH ||
    metadata.repoName !== env.PROVISION_BUILD_REPOSITORY || metadata.providerAccountName !== env.PROVISION_BUILD_REPOSITORY_OWNER ||
    !states.status.includes(event.payload.status) || !states.outcome.includes(event.payload.buildOutcome)) {
    throw new Error('Build event source mismatch')
  }
  return metadata
}

/** Accept only an exact UUID already returned by the Hook. Older deployments
 * that labeled Hooks distinctly may still attach a lost Hook response; a
 * push_event without a stored UUID can never claim an ambiguous dispatch. */
export async function observeProvisionBuild(database: D1Database,value: unknown,env: ProvisionDispatchEnvironment) {
  const event = buildEventSchema.parse(value)
  const metadata = validateEvent(event,env)
  const name = eventName(event.type),digest = await sha256(JSON.stringify(event))
  const eventKey = `${event.metadata.eventSubscriptionId}:${event.payload.buildUuid}:${name}:${event.metadata.eventTimestamp}`
  const existing = await database.prepare('SELECT payload_digest AS digest FROM site_provision_build_events WHERE event_key=?')
    .bind(eventKey).first<{ digest: string }>()
  if (existing) {
    if (existing.digest !== digest) throw new Error('Build event identity conflict')
    return { event: name,replayed: true as const }
  }
  const byBuild = await database.prepare('SELECT request_id AS requestId FROM site_provision_dispatch_runs WHERE build_uuid=?')
    .bind(event.payload.buildUuid).first<{ requestId: string }>()
  let requestId = byBuild?.requestId
  if (!requestId) {
    const archived = await database.prepare('SELECT request_id AS requestId FROM site_provision_dispatch_attempts WHERE build_uuid=?')
      .bind(event.payload.buildUuid).first<{ requestId: string }>()
    if (archived) {
      await database.prepare(`INSERT INTO site_provision_build_events
        (event_key,build_uuid,event_type,event_timestamp,payload_digest,received_at) VALUES (?,?,?,?,?,${timestamp})`)
        .bind(eventKey,event.payload.buildUuid,name,event.metadata.eventTimestamp,digest).run()
      return { event: name,requestId: archived.requestId,archived: true as const,replayed: false as const }
    }
  }
  // Cloudflare currently labels Deploy Hook builds as push_event and leaves
  // their commit empty. An exact UUID returned by the Hook remains sufficient
  // authority; an unbound push event must never claim an ambiguous dispatch.
  if (!requestId && metadata.buildTriggerSource === 'deploy_hook') {
    const attached = await database.prepare(`UPDATE site_provision_dispatch_runs SET build_uuid=?,build_commit=NULLIF(?,'')
      WHERE state='triggering_unknown' AND build_uuid IS NULL AND build_branch=?
      RETURNING request_id AS requestId`).bind(event.payload.buildUuid,event.payload.buildTriggerMetadata.commitHash,
        event.payload.buildTriggerMetadata.branch)
      .first<{ requestId: string }>()
    requestId = attached?.requestId
  }
  if (!requestId) return { event: name,ignored: true as const }
  const terminal = name !== 'started'
  let state = name === 'started' ? 'running' : 'needs_review'
  let error = name === 'failed' ? 'build_failed' : name === 'canceled' ? 'build_canceled' : 'build_succeeded_without_receipt'
  if (name === 'succeeded') {
    const completed = await database.prepare('SELECT completed_at AS completedAt FROM site_provision_operations WHERE operation_id=?')
      .bind(requestId).first<{ completedAt: string | null }>()
    if (completed?.completedAt) { state = 'succeeded'; error = '' }
  }
  const outcome = name === 'succeeded' ? 'success' : name === 'canceled' ? 'canceled' : name === 'failed' ? 'failure' : null
  const current = await database.prepare('SELECT state,build_outcome AS outcome FROM site_provision_dispatch_runs WHERE request_id=? AND build_uuid=?')
    .bind(requestId,event.payload.buildUuid).first<{ state: string; outcome: string | null }>()
  if (!current || (current.outcome && outcome && current.outcome !== outcome) ||
    (current.state === 'succeeded' && terminal && outcome !== 'success')) {
    throw new Error('Conflicting build terminal event')
  }
  await database.batch([
    database.prepare(`INSERT INTO site_provision_build_events
      (event_key,build_uuid,event_type,event_timestamp,payload_digest,received_at) VALUES (?,?,?,?,?,${timestamp})`)
      .bind(eventKey,event.payload.buildUuid,name,event.metadata.eventTimestamp,digest),
    database.prepare(`UPDATE site_provision_dispatch_runs SET build_commit=COALESCE(build_commit,NULLIF(?,'')),
      state=CASE WHEN state IN ('succeeded','needs_review','cancelled') THEN state ELSE ? END,
      running_at=CASE WHEN ?='started' THEN COALESCE(running_at,?) ELSE running_at END,
      completed_at=CASE WHEN ? THEN COALESCE(completed_at,?) ELSE completed_at END,
      build_outcome=COALESCE(?,build_outcome),last_error_code=? WHERE request_id=? AND build_uuid=?`)
      .bind(event.payload.buildTriggerMetadata.commitHash,state,name,event.metadata.eventTimestamp,
        terminal ? 1 : 0,event.metadata.eventTimestamp,outcome,error || null,requestId,event.payload.buildUuid),
  ])
  return { event: name,requestId,state,replayed: false as const }
}

export async function provisionDispatchQueue(batch: MessageBatch<unknown>,env: ProvisionDispatchEnvironment) {
  for (const message of batch.messages) {
    try {
      const dispatch = dispatchMessageSchema.safeParse(message.body)
      if (dispatch.success) {
        if (dispatch.data.buildBranch !== env.PROVISION_BUILD_BRANCH) throw new Error('Provision dispatch branch mismatch')
        await triggerProvisionBuild(env.CENTRAL_D1,dispatch.data,env.PROVISION_DEPLOY_HOOK_URL)
      }
      else await observeProvisionBuild(env.CENTRAL_D1,message.body,env)
      message.ack()
    } catch {
      message.retry({ delaySeconds: Math.min(300,30+message.attempts*30) })
    }
  }
}
