import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { readSiteRegistration } from '../../src/site-control/registry'
import type { inspectSiteRuntime } from '../../src/site-runtime/runtimeInspection'
import type { RoleSchema } from '../p1-schema'
import { ProvisionCloudflare } from './cloudflare'
import { assertGroupSettings } from './group'
import { groupRoutes } from './manifest'
import { parseVerificationRequest } from './verify-request'
import { verifySiteDatabase } from './verify-database'
import { runtimeProofSnapshot } from './runtime-proof'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { workersCiCommit } from '../workers-ci-identity.mjs'

assert.equal(process.env.WORKERS_CI,'1'); assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH ?? ''))
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(workersCiCommit(),commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME,undefined); assert.equal(process.env.WRANGLER_CI_MATCH_TAG,undefined)
assert.ok(process.env.SITE_VERIFY_REQUEST)
const request = parseVerificationRequest(JSON.parse(readFileSync(process.env.SITE_VERIFY_REQUEST,'utf8'))),{ group,central } = request
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,group.account_id)
const schema = JSON.parse(readFileSync('.cloudflare-ci/role-site-a-schema.json','utf8')) as RoleSchema
const api = new ProvisionCloudflare(group.account_id,process.env.CLOUDFLARE_API_TOKEN ?? '')
type Deployment = { id: string; versions: { version_id: string; percentage: number }[] }
const mapConcurrent = async <Input,Output>(items: Input[],limit: number,worker: (item: Input,index: number) => Promise<Output>) => {
  const results = new Array<Output>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit,items.length) },async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index],index)
    }
  }))
  return results
}
const deployment = async () => {
  const value = (await api.request<{ deployments: Deployment[] }>(`workers/scripts/${group.name}/deployments`)).result.deployments[0]
  assert.ok(value && value.id === request.expectedDeploymentId && value.versions.length === 1 && value.versions[0].percentage === 100,'Verification deployment changed')
  return value
}
const zone = await api.zone(request.zoneId); assert.equal(zone.account.id,group.account_id)
const workers = (await api.request<{ id: string; tag: string }[]>('workers/scripts')).result
for (const [name,tag] of [[group.name,request.workerTag],[central.name,request.centralWorkerTag]]) assert.equal(workers.find(worker => worker.id === name)?.tag,tag)
const before = await deployment()
const settings = (await api.request<Parameters<typeof assertGroupSettings>[0]>(`workers/scripts/${group.name}/settings`)).result
assertGroupSettings(settings,group)
const deployedCommit = settings.bindings.find(binding => binding.name === 'PROVISION_COMMIT')?.text
assert.match(deployedCommit ?? '',/^[a-f0-9]{40}$/)
const releaseId = settings.bindings.find(binding => binding.name === 'RELEASE_OPERATION')?.text ?? null
const centralSettings = (await api.request<{ bindings: { name: string; type: string; id?: string; text?: string }[] }>(`workers/scripts/${central.name}/settings`)).result
assert.ok(centralSettings.bindings.some(binding => binding.type === 'd1' && binding.name === 'CENTRAL_D1' && binding.id === central.d1_databases[0].database_id))
assert.equal(centralSettings.bindings.find(binding => binding.name === 'CENTRAL_ORIGIN')?.text,central.vars.CENTRAL_ORIGIN)
const domains = (await api.request<{ hostname: string; service: string; zone_id: string }[]>('workers/domains')).result
for (const config of [central,group]) {
  assert.deepEqual((await api.request(`workers/scripts/${config.name}/subdomain`)).result,{ enabled: false,previews_enabled: false })
  for (const route of config.routes) assert.ok(domains.some(domain => domain.hostname === route.pattern && domain.service === config.name && domain.zone_id === request.zoneId),'Verification domain mismatch')
  for (const database of config.d1_databases) assert.equal((await api.database(database.database_id)).name,database.database_name)
  for (const bucket of config.r2_buckets) {
    assert.equal((await api.request<{ name: string }>(`r2/buckets/${bucket.bucket_name}`)).result.name,bucket.bucket_name)
    assert.equal((await api.request<{ enabled: boolean }>(`r2/buckets/${bucket.bucket_name}/domains/managed`)).result.enabled,false)
    assert.deepEqual((await api.request<{ domains: unknown[] }>(`r2/buckets/${bucket.bucket_name}/domains/custom`)).result.domains,[])
  }
}
const directory = resolve('.cloudflare-ci/verify',request.operationId); mkdirSync(directory,{ recursive: true })
const configPath = resolve(directory,'proxy.json')
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-verify-maintenance',account_id: group.account_id,
  compatibility_date: group.compatibility_date,compatibility_flags: group.compatibility_flags,
  d1_databases: [...central.d1_databases,...group.d1_databases].map(db => ({ ...db,remote: true })),
  r2_buckets: group.r2_buckets.map(bucket => ({ ...bucket,remote: true })),
  services: [{ binding: 'INSPECT',service: group.name,entrypoint: 'SiteProvisionInspectionService',remote: true }] }))
type Environment = { CENTRAL_D1: D1Database; SITE_PUBLIC: R2Bucket; SITE_PRIVATE: R2Bucket;
  INSPECT: { verify: (siteId: string) => ReturnType<typeof inspectSiteRuntime> }; [name: `SITE_D1_${string}`]: D1Database }
const proxy = await getPlatformProxy<Environment>({ configPath,remoteBindings: true,persist: false })
try {
  const centralDb = proxy.env.CENTRAL_D1,routes = groupRoutes(group)
  const registered = (await centralDb.prepare('SELECT site_id FROM site_runtime_registry WHERE worker_group=? ORDER BY site_id').bind(group.vars.WORKER_GROUP).all<{ site_id: string }>()).results
  assert.deepEqual(registered.map(row => row.site_id),routes.map(route => route.siteId).sort(),'Current manifest omits a registered site')
  // Every target owns an independent D1 database. Verify them concurrently so
  // adding sites does not make the read-only release gate grow linearly until
  // Cloudflare terminates the build.
  const reports = await mapConcurrent(request.sites,3,async target => {
    const site = await readSiteRegistration(centralDb,target.siteId),binding = routes.find(route => route.siteId === target.siteId)!
    assert.ok(site && site.workerGroup === group.vars.WORKER_GROUP && site.localSiteId === binding.localSiteId && site.databaseId === binding.databaseId &&
      site.bindingName === binding.bindingName && site.schemaVersion === binding.schemaVersion,'Verification registration mismatch')
    const runtime = runtimeProofSnapshot(await proxy.env.INSPECT.verify(site.siteId))
    assert.ok(runtime.siteId === site.siteId && runtime.databaseId === site.databaseId && runtime.bindingName === site.bindingName && runtime.localSiteId === site.localSiteId &&
      runtime.schemaVersion === site.schemaVersion && runtime.workerGroup === site.workerGroup && runtime.adminHost === site.adminHost &&
      runtime.routingVersion === site.routingVersion && runtime.state === site.migrationState && runtime.releaseCommit === deployedCommit && runtime.releaseId === releaseId,'Deployed binding proof mismatch')
    const db = proxy.env[site.bindingName as `SITE_D1_${string}`]
    const centralRecord = await centralDb.prepare('SELECT tenant_id,runtime_site_id FROM sites WHERE id=?').bind(site.localSiteId).first<{ tenant_id: number; runtime_site_id: string }>()
    assert.ok(centralRecord && centralRecord.runtime_site_id === site.siteId,'Central site mapping mismatch')
    const projections = (await db.prepare('SELECT central_user_id FROM users').all<{ central_user_id: string }>()).results
    assert.equal(new Set(projections.map(user => user.central_user_id)).size,projections.length,'Duplicate identity projection')
    for (const user of projections) assert.ok(await centralDb.prepare('SELECT 1 FROM users WHERE CAST(id AS TEXT)=?').bind(user.central_user_id).first(),'Identity projection refers to a missing central user')
    const tenant = await db.prepare('SELECT central_source_record_id FROM tenants WHERE id=?').bind(runtime.tenantId).first<string>('central_source_record_id')
    assert.equal(tenant,String(centralRecord.tenant_id),'Tenant projection mismatch')
    const report = await verifySiteDatabase({ database: db,site,schema,schemaDigest: request.schemaDigest,accountId: group.account_id,ownership: target.ownership,
      publicBucket: proxy.env.SITE_PUBLIC,privateBucket: proxy.env.SITE_PRIVATE })
    assert.ok(JSON.stringify(await readSiteRegistration(centralDb,site.siteId)) === JSON.stringify(site),'Registration changed during verification')
    assert.deepEqual(runtimeProofSnapshot(await proxy.env.INSPECT.verify(site.siteId)),runtime,'Runtime changed during verification')
    const result = { ...report,runtime,identityProjections: projections.length }
    console.log(JSON.stringify({ event: 'site_verification_target_passed',operationId: request.operationId,siteId: site.siteId,tables: report.tables.length,
      contentDigest: report.contentDigest,media: report.media,taskRows: report.tasks.reduce((n,table) => n+table.rows,0) }))
    return result
  })
  assert.deepEqual(await deployment(),before)
  assertGroupSettings((await api.request<Parameters<typeof assertGroupSettings>[0]>(`workers/scripts/${group.name}/settings`)).result,group)
  const report = { event: 'site_verification_passed',operationId: request.operationId,checkedAt: new Date().toISOString(),commit,
    accountId: group.account_id,workerGroup: group.vars.WORKER_GROUP,deployment: before,mutations: false,reports,
    limits: ['No source-database migration comparison','SQL foreign keys and explicit task site references; arbitrary embedded HTML/SVG/JSON relations need migration graph validation',
      'Pending media without filenames counted separately; media objects larger than 64 MiB rejected','P2 scheduling and vendor execution are not implemented or certified'] }
  const serialized = JSON.stringify(report,null,2)
  writeFileSync(resolve(directory,'report.json'),serialized)
  // Avoid one oversized log line and wait for pipe backpressure before exit.
  // Each inventory chunk is independently attributed to this operation/site.
  const output = (value: unknown) => new Promise<void>((resolve,reject) => {
    process.stdout.write(JSON.stringify(value)+'\n',error => error ? reject(error) : resolve())
  })
  for (const target of reports) {
    const { tables,...metadata } = target
    await output({ event: 'site_verification_site_report',operationId: request.operationId,...metadata })
    for (let offset = 0; offset < tables.length; offset += 10) await output({ event: 'site_verification_inventory',operationId: request.operationId,
      siteId: target.siteId,offset,tables: tables.slice(offset,offset+10) })
  }
  await output({ event: report.event,operationId: report.operationId,checkedAt: report.checkedAt,commit,accountId: group.account_id,
    workerGroup: group.vars.WORKER_GROUP,deployment: before,mutations: false,limits: report.limits,reportDigest: provisionDigest(serialized),
    sites: reports.map(target => ({ siteId: target.siteId,tables: target.tables.length,contentDigest: target.contentDigest })) })
} finally { await proxy.dispose() }
process.exit(0)
