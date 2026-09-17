import assert from 'node:assert/strict'
import type { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { serializeProvisionPlan, type ProvisionPlan } from '../../src/site-control/provisionPlan'

export type ProvisionMode = 'dry-run' | 'apply'
export type ProvisionStages = {
  journal: ProvisionJournal
  prepare: (mode: ProvisionMode) => Promise<unknown>
  seed: (mode: ProvisionMode) => Promise<unknown>
  finish: (mode: ProvisionMode) => Promise<unknown>
  verifyCompleted: () => Promise<unknown>
}

/** Select stages from the durable journal, never a caller's checkpoint. Each
 * stage owns its lease and effects; checkpoints are re-read between stages.
 * A dry run previews only the available stage and names the remaining work.
 * Completed operations are read-only even when invoked with --apply. */
export async function provisionSite(plan: ProvisionPlan,mode: ProvisionMode,stages: ProvisionStages) {
  serializeProvisionPlan(plan)
  assert.ok(['dry-run','apply'].includes(mode),'Explicit provision mode required')
  const preview = await stages.journal.preview(plan)
  let operation = preview.mode === 'resume' ? preview.operation : null
  const before = operation?.checkpoint ?? 0
  if (operation?.completedAt) {
    assert.equal(operation.checkpoint,6)
    const verification = await stages.verifyCompleted()
    return { operationId: plan.operationId,siteId: plan.siteId,checkpoint: 6,complete: true,mutations: false,verification }
  }
  const remaining = ['database','schema','seed','deploy','verify','activate'].slice(before)
  if (mode === 'dry-run') {
    const current = before < 2 ? await stages.prepare(mode) : before < 3 ? await stages.seed(mode) : await stages.finish(mode)
    return { operationId: plan.operationId,siteId: plan.siteId,checkpoint: before,complete: false,mutations: false,remaining,current }
  }
  if (before < 2) {
    await stages.prepare(mode)
    operation = await stages.journal.read(plan.operationId)
    assert.equal(operation?.checkpoint,2,'Database preparation did not reach schema readiness')
  }
  if ((operation?.checkpoint ?? 0) < 3) {
    await stages.seed(mode)
    operation = await stages.journal.read(plan.operationId)
    assert.equal(operation?.checkpoint,3,'Provision seed did not complete')
  }
  const result = await stages.finish(mode)
  operation = await stages.journal.read(plan.operationId)
  assert.ok(operation?.completedAt && operation.checkpoint === 6,'Provision activation did not complete')
  return { operationId: plan.operationId,siteId: plan.siteId,checkpoint: 6,complete: true,mutations: true,resumed: before > 0,result }
}
