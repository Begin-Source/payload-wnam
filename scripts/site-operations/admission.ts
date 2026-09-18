import assert from 'node:assert/strict'
import { optionalSiteContext } from '../../src/site-runtime/context'
import { parseProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { provisionActorPermission,provisionOwnerPermission } from '../../src/site-control/provisionAdmissionSchema'
import { provisionDigest,provisionUuidSchema,serializeProvisionPlan } from '../../src/site-control/provisionPlan'
import { parseProvisionRequest } from './manifest'

/** Persist the checked cloud planner's complete immutable request before the
 * existing journal reservation. The D1 reservation trigger atomically checks
 * this exact plan and moves admission to provisioning, or rejects cancellation
 * and revoked authority. This function alone creates no infrastructure.
 * Callers must first verify the chosen current group/deployment and full fleet.
 */
export async function prepareProvisionAdmission(database: D1Database,value: unknown) {
  if (optionalSiteContext()) throw new Error('Provision maintenance is central-only')
  const request = parseProvisionRequest(value),{ plan } = request
  const saved = await database.prepare('SELECT input_json,input_digest,local_site_id FROM site_provision_requests WHERE request_id=?')
    .bind(plan.operationId).first<{ input_json: string; input_digest: string; local_site_id: number }>()
  assert.ok(saved,'Provision admission missing')
  assert.equal(provisionDigest(saved.input_json),saved.input_digest,'Provision admission digest mismatch')
  const input = parseProvisionAdmission(JSON.parse(saved.input_json))
  assert.equal(plan.localSiteId,saved.local_site_id,'Prepared plan changed the allocated site ID')
  assert.deepEqual({ requestId: plan.operationId,siteId: plan.siteId,name: plan.name,tenantId: plan.tenantId,ownerUserId: plan.ownerUserId,timezone: plan.timezone },input,
    'Prepared plan differs from the human request')
  // Store original JSON property order; the existing baseline hash depends on it.
  const json = JSON.stringify(value),planJson = serializeProvisionPlan(plan),digest = provisionDigest(planJson)
  await database.prepare(`UPDATE site_provision_requests AS q SET prepared_request_json=?,prepared_plan_json=?,prepared_plan_digest=?,prepared_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE request_id=? AND input_digest=? AND state='queued' AND prepared_request_json IS NULL
      AND ${provisionActorPermission('q.actor_user_id','q.tenant_id')} AND ${provisionOwnerPermission('q.owner_user_id','q.tenant_id')}
      AND EXISTS (SELECT 1 FROM tenants t WHERE t.id=q.tenant_id)
      AND NOT EXISTS (SELECT 1 FROM site_provision_operations o WHERE o.operation_id=q.request_id OR (o.worker_group=? AND o.completed_at IS NULL))
      AND NOT EXISTS (SELECT 1 FROM site_provision_requests other WHERE other.request_id!=q.request_id AND other.state='queued'
        AND json_extract(other.prepared_plan_json,'$.workerGroup')=?)`)
    .bind(json,planJson,digest,plan.operationId,saved.input_digest,plan.workerGroup,plan.workerGroup).run()
  const prepared = await database.prepare('SELECT prepared_request_json,prepared_plan_json,prepared_plan_digest,state FROM site_provision_requests WHERE request_id=?')
    .bind(plan.operationId).first<{ prepared_request_json: string | null; prepared_plan_json: string | null; prepared_plan_digest: string | null; state: string }>()
  assert.ok(prepared && prepared.state !== 'cancelled' && prepared.prepared_request_json === json && prepared.prepared_plan_json === planJson && prepared.prepared_plan_digest === digest,
    'Provision admission changed, was cancelled, lost permission or has a different prepared plan')
  return request
}

/** Maintenance-only read for resumption/history. Do not return the complete
 * resource manifest through the browser-facing admission summary. */
export async function readPreparedProvisionAdmission(database: D1Database,requestId: string) {
  if (optionalSiteContext()) throw new Error('Provision maintenance is central-only')
  provisionUuidSchema.parse(requestId)
  const row = await database.prepare(`SELECT state,input_json,input_digest,local_site_id,prepared_request_json,prepared_plan_json,prepared_plan_digest
    FROM site_provision_requests WHERE request_id=?`).bind(requestId).first<{
      state: string; input_json: string; input_digest: string; local_site_id: number;
      prepared_request_json: string | null; prepared_plan_json: string | null; prepared_plan_digest: string | null
    }>()
  assert.ok(row && row.state !== 'cancelled','Provision admission missing or cancelled')
  assert.equal(provisionDigest(row.input_json),row.input_digest,'Provision admission digest mismatch')
  const input = parseProvisionAdmission(JSON.parse(row.input_json))
  assert.equal(input.requestId,requestId)
  if (!row.prepared_request_json) {
    assert.equal(row.state,'queued'); assert.equal(row.prepared_plan_json,null); assert.equal(row.prepared_plan_digest,null)
    return { input,localSiteId: row.local_site_id,request: null,raw: null }
  }
  const raw: unknown = JSON.parse(row.prepared_request_json),request = parseProvisionRequest(raw),{ plan } = request
  assert.equal(serializeProvisionPlan(plan),row.prepared_plan_json,'Prepared plan changed')
  assert.equal(provisionDigest(row.prepared_plan_json!),row.prepared_plan_digest,'Prepared plan digest changed')
  assert.equal(plan.localSiteId,row.local_site_id,'Allocated site ID changed')
  assert.deepEqual({ requestId: plan.operationId,siteId: plan.siteId,name: plan.name,tenantId: plan.tenantId,ownerUserId: plan.ownerUserId,timezone: plan.timezone },input,
    'Prepared plan differs from the human request')
  return { input,localSiteId: row.local_site_id,request,raw }
}
