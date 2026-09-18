import assert from 'node:assert/strict'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import type { AdmissionPlannerDependencies } from './admission-plan'
import type { ProvisionCloudflare } from './cloudflare'
import { ProvisionGroup } from './group'

/** Read-only account API adapter. Bracket all resource checks with deployed
 * snapshots so a concurrent upload cannot supply a mixed planning baseline. */
type InspectionGroup = Pick<Parameters<AdmissionPlannerDependencies['inspect']>[0],'latestRequest' | 'manifest' | 'manifestDigest'>
export function admissionGroupInspector(api: ProvisionCloudflare) {
  return async (group: InspectionGroup) => {
    assert.equal(api.accountId,group.latestRequest.plan.accountId)
    assert.equal(group.manifestDigest,provisionDigest(JSON.stringify(group.manifest)))
    const service = new ProvisionGroup(api,group.latestRequest)
    const before = await service.releaseSnapshot(group.manifest)
    await service.resources(group.manifest)
    assert.deepEqual((await api.request(`workers/scripts/${group.latestRequest.central.name}/subdomain`)).result,
      { enabled: false,previews_enabled: false })
    assert.deepEqual(await service.releaseSnapshot(group.manifest),before,'Group changed during resource inspection')
    return { deploymentId: before.deploymentId,manifestDigest: before.manifestDigest }
  }
}
