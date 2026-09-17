import assert from 'node:assert/strict'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { ProvisionCloudflare } from './cloudflare'
import type { GroupDeployment } from './finish'
import type { GroupManifest, ProvisionRequest } from './manifest'

type Binding = { name: string; type: string; id?: string; text?: string; bucket_name?: string; service?: string; entrypoint?: string }
type Settings = { bindings: Binding[]; compatibility_date: string; compatibility_flags: string[] }
type Deployment = { id: string; versions: { version_id: string; percentage: number }[] }
const provenanceNames = ['PROVISION_OPERATION','PROVISION_MANIFEST','PROVISION_COMMIT']

export function assertGroupSettings(actual: Settings,expected: GroupManifest) {
  assert.equal(actual.compatibility_date,expected.compatibility_date)
  assert.deepEqual([...actual.compatibility_flags].sort(),[...expected.compatibility_flags].sort())
  const bindings: Binding[] = [
    { name: 'ASSETS',type: 'assets' },{ name: 'PAYLOAD_SECRET',type: 'secret_text' },
    ...expected.d1_databases.map(db => ({ name: db.binding,type: 'd1',id: db.database_id })),
    ...expected.r2_buckets.map(bucket => ({ name: bucket.binding,type: 'r2_bucket',bucket_name: bucket.bucket_name })),
    ...expected.services.map(service => ({ name: service.binding,type: 'service',service: service.service,entrypoint: service.entrypoint })),
    ...Object.entries(expected.vars).map(([name,text]) => ({ name,type: 'plain_text',text })),
  ]
  const normalize = (b: Binding) => ({ name: b.name,type: b.type,...(b.type === 'plain_text' ? { text: b.text } : {}),
    ...(b.type === 'd1' ? { id: b.id } : {}),...(b.type === 'r2_bucket' ? { bucket_name: b.bucket_name } : {}),
    ...(b.type === 'service' ? { service: b.service,entrypoint: b.entrypoint } : {}) })
  assert.deepEqual(actual.bindings.filter(b => !provenanceNames.includes(b.name)).map(normalize).sort((a,b) => a.name.localeCompare(b.name)),
    bindings.map(normalize).sort((a,b) => a.name.localeCompare(b.name)),'Group bindings differ from reviewed manifest')
  const provenance = actual.bindings.filter(b => provenanceNames.includes(b.name))
  assert.ok(provenance.length === 0 || provenance.length === 3 && provenanceNames.every(name => provenance.filter(b => b.name === name && b.type === 'plain_text').length === 1),'Incomplete group provenance')
}

export class ProvisionGroup {
  constructor(private api: ProvisionCloudflare,private request: ProvisionRequest) {}
  async deployment() {
    const deployment = (await this.api.request<{ deployments: Deployment[] }>(`workers/scripts/${this.request.plan.workerName}/deployments`)).result.deployments[0]
    assert.ok(deployment); assert.equal(deployment.versions.length,1); assert.equal(deployment.versions[0].percentage,100)
    return deployment
  }
  async inspect(target?: GroupManifest): Promise<(GroupDeployment & { operationId: string }) | null> {
    const { plan,baseline } = this.request,before = await this.deployment()
    const actual = (await this.api.request<Settings>(`workers/scripts/${plan.workerName}/settings`)).result
    const isBaseline = actual.bindings.find(b => b.name === 'SITE_ROUTES')?.text === baseline.vars.SITE_ROUTES
    assert.ok(isBaseline || target,'Unexpected group manifest before database creation')
    assertGroupSettings(actual,isBaseline ? baseline : target!)
    assert.deepEqual((await this.api.request(`workers/scripts/${plan.workerName}/subdomain`)).result,{ enabled: false,previews_enabled: false })
    const after = await this.deployment(); assert.equal(before.id,after.id,'Group deployment changed during inspection')
    if (isBaseline) { assert.equal(after.id,plan.expectedDeploymentId,'Reviewed baseline deployment changed'); return null }
    const value = (name: string) => actual.bindings.find(b => b.name === name && b.type === 'plain_text')?.text
    const manifestDigest = provisionDigest(JSON.stringify(target))
    assert.equal(value('PROVISION_OPERATION'),plan.operationId); assert.equal(value('PROVISION_MANIFEST'),manifestDigest)
    const commit = value('PROVISION_COMMIT'); assert.ok(commit && /^[a-f0-9]{40}$/.test(commit),'Missing deployed commit')
    return { deploymentId: after.id,versionId: after.versions[0].version_id,manifestDigest,commit,operationId: plan.operationId }
  }
  async resources() {
    const { plan,baseline,central,centralWorkerTag,zoneId } = this.request
    const zone = await this.api.zone(zoneId)
    assert.equal(zone.id,zoneId); assert.equal(zone.account.id,plan.accountId); assert.equal(zone.name,'beginos.org')
    const workers = (await this.api.request<{ id: string; tag: string }[]>('workers/scripts')).result
    assert.equal(workers.find(worker => worker.id === plan.workerName)?.tag,plan.workerTag)
    assert.equal(workers.find(worker => worker.id === central.name)?.tag,centralWorkerTag)
    const centralSettings = (await this.api.request<Settings>(`workers/scripts/${central.name}/settings`)).result
    assert.ok(centralSettings.bindings.some(b => b.name === 'CENTRAL_D1' && b.type === 'd1' && b.id === plan.centralDatabaseId))
    assert.equal(centralSettings.bindings.find(b => b.name === 'CENTRAL_ORIGIN')?.text,plan.centralOrigin)
    for (const database of [...central.d1_databases,...baseline.d1_databases]) assert.equal((await this.api.database(database.database_id)).name,database.database_name)
    for (const bucket of [...central.r2_buckets,...baseline.r2_buckets]) {
      const actual = (await this.api.request<{ name: string; location: string }>(`r2/buckets/${bucket.bucket_name}`)).result
      assert.equal(actual.name,bucket.bucket_name); assert.equal(actual.location,'WNAM')
      assert.equal((await this.api.request<{ enabled: boolean }>(`r2/buckets/${bucket.bucket_name}/domains/managed`)).result.enabled,false)
      assert.deepEqual((await this.api.request<{ domains: unknown[] }>(`r2/buckets/${bucket.bucket_name}/domains/custom`)).result.domains,[])
      const owner = bucket.binding === 'CENTRAL_MEDIA' || bucket.binding === 'MASTER_ASSET_ARCHIVE' ? centralSettings : null
      if (owner) assert.ok(owner.bindings.some(b => b.type === 'r2_bucket' && b.name === bucket.binding && b.bucket_name === bucket.bucket_name))
    }
    const domains = (await this.api.request<{ hostname: string; service: string; zone_id: string }[]>('workers/domains')).result
    for (const [config,hosts] of [[central,central.routes],[baseline,baseline.routes]] as const) for (const route of hosts) {
      const actual = domains.find(domain => domain.hostname === route.pattern)
      assert.equal(actual?.service,config.name); assert.equal(actual?.zone_id,zoneId)
    }
    const target = domains.find(domain => domain.hostname === plan.adminHost)
    if (target) { assert.equal(target.service,plan.workerName); assert.equal(target.zone_id,zoneId) }
    else assert.deepEqual(await this.api.domainRecords(zoneId,plan.adminHost),[],'Refusing to overwrite existing DNS')
  }
}
