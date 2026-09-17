import type { PayloadRequest } from 'payload'
import { canonicalMasterJSON, masterDigest } from '../site-control/masterSnapshot'
import { assertMasterOperationId, masterOperationContext } from './masterCopies'

export type PromptSelection = {
  operationId: string; targetId: number; expectedTargetUpdatedAt: string
  previous: { id: number; updatedAt: string } | null
}
function timestamp(value: string): void {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) throw new Error('Exact prompt modification time required')
}
/** Explicitly switch one tenant/key/profile slot. The previously active body
 * remains intact. Concurrent review/edit/selection changes make this operation
 * fail, rather than silently replacing something the manager did not review. */
export async function selectMasterPrompt(req: PayloadRequest, input: PromptSelection): Promise<void> {
  assertMasterOperationId(input.operationId)
  if (!Object.hasOwn(input,'previous') || (input.previous !== null && (typeof input.previous !== 'object' || Array.isArray(input.previous)))) {
    throw new Error('Explicit previous prompt selection required')
  }
  if (!Number.isSafeInteger(input.targetId) || input.targetId < 1 ||
    (input.previous && (!Number.isSafeInteger(input.previous.id) || input.previous.id < 1))) throw new Error('Invalid prompt selection identity')
  timestamp(input.expectedTargetUpdatedAt)
  if (input.previous) timestamp(input.previous.updatedAt)
  const selection: PromptSelection = { operationId: input.operationId,targetId: input.targetId,expectedTargetUpdatedAt: input.expectedTargetUpdatedAt,
    previous: input.previous ? { id: input.previous.id,updatedAt: input.previous.updatedAt } : null }
  const { database,context,tenant,user,ownership } = await masterOperationContext(req)
  const requestJSON = canonicalMasterJSON({ kind: 'select-prompt',siteId: context.siteId,actor: user.centralUserId,selection })
  const digest = await masterDigest(requestJSON)
  const at = new Date().toISOString(), operationId = selection.operationId
  const pending = `EXISTS(SELECT 1 FROM site_master_operations WHERE operation_id=? AND request_digest=? AND committed=0)`
  const scope = `p.tenant_id=t.tenant_id AND p.key=t.key AND COALESCE(p.pipeline_profile_id,0)=COALESCE(t.pipeline_profile_id,0)`
  const expected = selection.previous
    ? `EXISTS(SELECT 1 FROM tenant_prompt_templates p WHERE ${scope} AND p.master_enabled=1 AND p.id=? AND p.updated_at=?)`
    : `NOT EXISTS(SELECT 1 FROM tenant_prompt_templates p WHERE ${scope} AND p.master_enabled=1)`
  const values = [operationId,digest,requestJSON,user.centralUserId,at,selection.targetId,tenant.localTenantId,selection.expectedTargetUpdatedAt,
    ...(selection.previous ? [selection.previous.id,selection.previous.updatedAt] : [])]
  await database.batch([
    database.prepare(`INSERT INTO site_master_operations(operation_id,request_digest,request_json,kind,actor_id,created_at)
      SELECT ?,?,?,'select-prompt',?,? FROM tenant_prompt_templates t
      WHERE t.id=? AND t.tenant_id=? AND t.updated_at=? AND ${ownership} AND ${expected} ON CONFLICT DO NOTHING`).bind(...values),
    database.prepare(`UPDATE tenant_prompt_templates AS p SET master_enabled=0,updated_at=?
      WHERE master_enabled=1 AND ${pending} AND EXISTS(SELECT 1 FROM tenant_prompt_templates t WHERE t.id=? AND ${scope})`)
      .bind(at,operationId,digest,selection.targetId),
    database.prepare(`UPDATE tenant_prompt_templates SET master_enabled=1,updated_at=? WHERE id=? AND tenant_id=? AND ${pending}`)
      .bind(at,selection.targetId,tenant.localTenantId,operationId,digest),
    database.prepare(`UPDATE site_master_operations SET committed=CASE WHEN ${ownership} AND EXISTS(SELECT 1 FROM tenant_prompt_templates
      WHERE id=? AND tenant_id=? AND master_enabled=1 AND updated_at=?) THEN 1 ELSE -1 END
      WHERE operation_id=? AND request_digest=? AND committed=0`).bind(selection.targetId,tenant.localTenantId,at,operationId,digest),
  ])
  const receipt = await database.prepare('SELECT request_digest AS digest,committed FROM site_master_operations WHERE operation_id=?')
    .bind(operationId).first<{ digest: string;committed: number }>()
  if (!receipt || receipt.digest !== digest || receipt.committed !== 1) throw new Error('Prompt selection changed or operation conflicts; refresh before selecting')
  req.payloadDataLoader?.clearAll()
}
