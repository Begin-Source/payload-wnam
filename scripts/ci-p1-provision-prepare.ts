import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { ProvisionJournal } from '../src/site-control/provisionJournal'
import { provisionPlan, provisionDigest } from '../src/site-control/provisionPlan'
import { p1Manifests, P1_ACCOUNT, P1_ORIGIN } from './p1-manifests.mjs'
import { roleSchemaDigest, type RoleSchema } from './p1-schema'
import { ProvisionCloudflare } from './site-operations/cloudflare'
import { prepareSiteDatabase } from './site-operations/prepare'

const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit); assert.equal(process.env.P1_SITE_PREPARE,'1')
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
const { central,site } = p1Manifests()
const centralId = central.d1_databases[0].database_id as string
const schema = JSON.parse(readFileSync('.cloudflare-ci/role-site-a-schema.json','utf8')) as RoleSchema
const api = new ProvisionCloudflare(P1_ACCOUNT,process.env.CLOUDFLARE_API_TOKEN ?? '')
const operationId = 'f8d779c3-12a4-491c-b368-00f274be2bfd'
const request = { operationId,accountId: P1_ACCOUNT,centralDatabaseId: centralId,centralOrigin: P1_ORIGIN,
  siteId: 'p1-c',localSiteId: 103,name: 'P1 Provisioned Site C',tenantId: 1,ownerUserId: 7,
  workerGroup: site.vars.WORKER_GROUP as string,workerName: site.name as string,workerTag: 'e73dabad443148d1a6cede5c19ee203e',
  baselineManifestDigest: provisionDigest(JSON.stringify(site)),bindingName: 'SITE_D1_C',schemaVersion: 1,schemaDigest: roleSchemaDigest(schema.objects),timezone: 'UTC' }
type Deployment = { id: string; versions: { version_id: string; percentage: number }[] }
type Binding = { name: string; type: string; id?: string; text?: string; bucket_name?: string; service?: string; entrypoint?: string }
const preflight = async () => {
  const centralInfo = await api.database(centralId)
  assert.equal(centralInfo.name,'payload-wnam-p1-central')
  const workers = (await api.request<{ id: string; tag: string }[]>('workers/scripts')).result
  assert.equal(workers.find(worker => worker.id === site.name)?.tag,request.workerTag)
  const settings = (await api.request<{ bindings: Binding[]; compatibility_date: string; compatibility_flags: string[] }>(`workers/scripts/${site.name}/settings`)).result
  assert.equal(settings.compatibility_date,site.compatibility_date)
  assert.deepEqual([...settings.compatibility_flags].sort(),[...site.compatibility_flags].sort())
  assert.deepEqual(settings.bindings.filter(binding => binding.type === 'd1').map(binding => ({ name: binding.name,id: binding.id })).sort((a,b) => a.name.localeCompare(b.name)),
    site.d1_databases.map((db: { binding: string; database_id: string }) => ({ name: db.binding,id: db.database_id })).sort((a: { name: string },b: { name: string }) => a.name.localeCompare(b.name)))
  for (const [key,value] of Object.entries(site.vars)) assert.equal(settings.bindings.find(binding => binding.name === key)?.text,value)
  for (const binding of site.r2_buckets) assert.ok(settings.bindings.some(value => value.type === 'r2_bucket' && value.name === binding.binding && value.bucket_name === binding.bucket_name))
  for (const binding of site.services) assert.ok(settings.bindings.some(value => value.type === 'service' && value.name === binding.binding && value.service === binding.service && value.entrypoint === binding.entrypoint))
  const subdomain = (await api.request<{ enabled: boolean; previews_enabled: boolean }>(`workers/scripts/${site.name}/subdomain`)).result
  assert.equal(subdomain.enabled,false); assert.equal(subdomain.previews_enabled,false)
  return (await api.request<{ deployments: Deployment[] }>(`workers/scripts/${site.name}/deployments`)).result.deployments[0]
}
const initialDeployment = await preflight()
const proxyConfig = (databaseId: string,binding: string,name: string) => ({ name: 'payload-wnam-provision-maintenance',account_id: P1_ACCOUNT,
  compatibility_date: '2025-08-15',compatibility_flags: ['nodejs_compat','global_fetch_strictly_public'],
  d1_databases: [{ binding,database_name: name,database_id: databaseId,remote: true }],
})
writeFileSync('.cloudflare-ci/provision-central.json',JSON.stringify(proxyConfig(centralId,'CENTRAL_D1','payload-wnam-p1-central')))
const centralProxy = await getPlatformProxy({ configPath: '.cloudflare-ci/provision-central.json',remoteBindings: true,persist: false })
const database = centralProxy.env.CENTRAL_D1 as D1Database
const journal = new ProvisionJournal(database,{ accountId: P1_ACCOUNT,centralDatabaseId: centralId })
try {
  const saved = await journal.plan(operationId)
  const plan = saved ?? provisionPlan({ ...request,expectedDeploymentId: initialDeployment.id })
  // Every request property remains explicitly pinned across builds. An older
  // deployment ID is provenance; preparing an unbound database does not change
  // the Worker, and still requires its entire baseline binding manifest.
  for (const [key,value] of Object.entries(request)) assert.equal(plan[key as keyof typeof plan],value)
  if (!saved) assert.equal((await preflight()).id,plan.expectedDeploymentId)
  const deps = { journal,api,preflight: async () => { await preflight() },openDatabase: async (id: string) => {
    writeFileSync('.cloudflare-ci/provision-site.json',JSON.stringify(proxyConfig(id,'PROVISION_D1',plan.databaseName)))
    const proxy = await getPlatformProxy({ configPath: '.cloudflare-ci/provision-site.json',remoteBindings: true,persist: false })
    return { database: proxy.env.PROVISION_D1 as D1Database,close: () => proxy.dispose() }
  } }
  const before = await journal.read(operationId)
  const preview = await prepareSiteDatabase(plan,schema,'dry-run',deps)
  assert.deepEqual(await journal.read(operationId),before,'Dry run must not reserve or advance a plan')
  console.log(JSON.stringify({ event: 'p1_provision_preview_passed',...preview }))
  if (!before) {
    // Dedicated new test resource: simulate a lost create result at the exact
    // journal boundary, then resume through a new executor invocation. Never
    // inject into an already prepared operation or another site's database.
    await assert.rejects(prepareSiteDatabase(plan,schema,'apply',{ ...deps,afterCreate: async () => { throw new Error('P1 injected create-result interruption') } }),/P1 injected create-result interruption/)
    const interrupted = await journal.read(operationId)
    assert.equal(interrupted?.checkpoint,0); assert.equal(interrupted?.pendingStep,1)
    console.log(JSON.stringify({ event: 'p1_provision_create_interrupted',operationId,siteId: plan.siteId,checkpoint: 0,pendingStep: 1 }))
  }
  const prepared = await prepareSiteDatabase(plan,schema,'apply',deps)
  const receipts = await database.prepare('SELECT step,intent_digest,receipt_json FROM site_provision_steps WHERE operation_id=? ORDER BY step').bind(operationId).all()
  const repeated = await prepareSiteDatabase(plan,schema,'apply',deps)
  assert.deepEqual(repeated,prepared)
  assert.deepEqual((await database.prepare('SELECT step,intent_digest,receipt_json FROM site_provision_steps WHERE operation_id=? ORDER BY step').bind(operationId).all()).results,receipts.results)
  assert.equal((await api.findDatabase(plan.databaseName))?.uuid,prepared.databaseId)
  assert.equal(await database.prepare('SELECT COUNT(*) AS n FROM site_runtime_registry WHERE site_id=?').bind(plan.siteId).first('n'),0)
  assert.equal((await preflight()).id,initialDeployment.id,'Database preparation must not deploy or alter group bindings')
  const report = { event: 'p1_provision_database_prepared',commit,checkedAt: new Date().toISOString(),...prepared,
    databaseName: plan.databaseName,resumedAfterInjectedCreate: !before,repeatVerified: true,groupDeploymentUnchanged: initialDeployment.id,
    checks: ['read-only-preview','explicit-account-and-resource-pins','real-cloudflare-create-or-reconcile','native-remote-d1-schema','repeat-same-database-and-receipts','not-yet-registered-or-active'],
    remaining: ['seed','deploy','verify','activate'] }
  writeFileSync('.cloudflare-ci/p1-provision-prepare.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
} finally { await centralProxy.dispose() }
process.exit(0)
