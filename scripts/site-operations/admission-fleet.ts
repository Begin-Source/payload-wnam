import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { optionalSiteContext } from '../../src/site-runtime/context'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { readPreparedProvisionAdmission } from './admission'
import { parseProvisionFleet,resolveProvisionFleet } from './fleet'
import { parseProvisionRequest,provisionManifest } from './manifest'

/** Extend explicitly selected, reviewed groups using completed central requests.
 * Link by full baseline identity, not timestamps or an operator-maintained latest
 * request file. The existing fleet resolver still verifies every original plan,
 * receipt, schema and current registration. This is read-only and fail-closed. */
export async function resolveAdmissionFleet(input: unknown,database: D1Database) {
  if (optionalSiteContext()) throw new Error('Provision fleet is central-only')
  const fleet = parseProvisionFleet(input)
  for (const group of fleet.groups) {
    const last = parseProvisionRequest(group.requests.at(-1))
    const journal = new ProvisionJournal(database,{ accountId: last.plan.accountId,centralDatabaseId: last.plan.centralDatabaseId })
    const rows = (await database.prepare(`SELECT q.request_id FROM site_provision_requests q
      JOIN site_provision_operations o ON o.operation_id=q.request_id
      WHERE o.worker_group=? AND o.completed_at IS NOT NULL ORDER BY q.request_id LIMIT 51`)
      .bind(group.workerGroup).all<{ request_id: string }>()).results
    assert.ok(rows.length <= 50,'Too many completed admissions in one group')
    const pending = []
    for (const row of rows) {
      const saved = await readPreparedProvisionAdmission(database,row.request_id)
      assert.ok(saved.request && saved.raw,'Completed admission has no prepared request')
      assert.equal(saved.request.plan.workerGroup,group.workerGroup,'Admission group changed')
      const listed = group.requests.map(parseProvisionRequest).find(request => request.plan.operationId === row.request_id)
      if (listed) assert.deepEqual(listed,saved.request,'Reviewed request differs from durable admission')
      else pending.push(saved)
    }
    const operation = await journal.read(last.plan.operationId)
    assert.ok(operation?.databaseId && operation.completedAt,'Reviewed fleet baseline is incomplete')
    let manifest = provisionManifest(last,operation.databaseId)
    while (pending.length) {
      const next = pending.filter(saved => isDeepStrictEqual(saved.request!.baseline,manifest))
      assert.equal(next.length,1,'Completed admission history has a gap or fork')
      const saved = next[0],request = saved.request!
      assert.equal(request.plan.baselineManifestDigest,provisionDigest(JSON.stringify(manifest)))
      const completed = await journal.read(request.plan.operationId)
      assert.ok(completed?.databaseId && completed.completedAt,'Admission completion changed')
      group.requests.push(saved.raw)
      manifest = provisionManifest(request,completed.databaseId)
      pending.splice(pending.indexOf(saved),1)
    }
  }
  return resolveProvisionFleet(fleet,database)
}
