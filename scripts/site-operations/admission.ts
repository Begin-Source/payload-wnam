import assert from 'node:assert/strict'
import { optionalSiteContext } from '../../src/site-runtime/context'
import { parseProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { provisionActorPermission,provisionOwnerPermission } from '../../src/site-control/provisionAdmissionSchema'
import { provisionDigest,serializeProvisionPlan } from '../../src/site-control/provisionPlan'
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
  const saved = await database.prepare('SELECT input_json,input_digest FROM site_provision_requests WHERE request_id=?')
    .bind(plan.operationId).first<{ input_json: string; input_digest: string }>()
  assert.ok(saved,'Provision admission missing')
  assert.equal(provisionDigest(saved.input_json),saved.input_digest,'Provision admission digest mismatch')
  const input = parseProvisionAdmission(JSON.parse(saved.input_json))
  assert.deepEqual({ requestId: plan.operationId,siteId: plan.siteId,name: plan.name,tenantId: plan.tenantId,ownerUserId: plan.ownerUserId,timezone: plan.timezone },input,
    'Prepared plan differs from the human request')
  // Store original JSON property order; the existing baseline hash depends on it.
  const json = JSON.stringify(value),planJson = serializeProvisionPlan(plan),digest = provisionDigest(planJson)
  await database.prepare(`UPDATE site_provision_requests AS q SET prepared_request_json=?,prepared_plan_json=?,prepared_plan_digest=?,prepared_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE request_id=? AND input_digest=? AND state='queued' AND prepared_request_json IS NULL
      AND ${provisionActorPermission('q.actor_user_id','q.tenant_id')} AND ${provisionOwnerPermission('q.owner_user_id','q.tenant_id')}
      AND EXISTS (SELECT 1 FROM tenants t WHERE t.id=q.tenant_id)
      AND NOT EXISTS (SELECT 1 FROM site_provision_operations o WHERE o.operation_id=q.request_id)`)
    .bind(json,planJson,digest,plan.operationId,saved.input_digest).run()
  const prepared = await database.prepare('SELECT prepared_request_json,prepared_plan_json,prepared_plan_digest,state FROM site_provision_requests WHERE request_id=?')
    .bind(plan.operationId).first<{ prepared_request_json: string | null; prepared_plan_json: string | null; prepared_plan_digest: string | null; state: string }>()
  assert.ok(prepared && prepared.state !== 'cancelled' && prepared.prepared_request_json === json && prepared.prepared_plan_json === planJson && prepared.prepared_plan_digest === digest,
    'Provision admission changed, was cancelled, lost permission or has a different prepared plan')
  return request
}
