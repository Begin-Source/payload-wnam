import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { getPayload, type Payload } from 'payload'
import { createCentralPayloadConfig } from '../../src/site-control/config'
import { createSitePayloadConfig } from '../../src/site-runtime/config'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import type { inspectProvisionedSite } from '../../src/site-runtime/provisionInspection'
import { p1DataDeliverySelection,p1DataDeliverySiteManifest } from '../p1-data-delivery-resources.mjs'
import { browserLibraryEnvironment } from '../ci-browser-libs.mjs'
import type { RoleSchema } from '../p1-schema'
import { ProvisionCloudflare } from './cloudflare'
import { ProvisionGroup } from './group'
import { groupRoutes, parseProvisionRequest, provisionManifest, type GroupManifest } from './manifest'
import { prepareSiteDatabase } from './prepare'
import { seedProvisionedSite } from './seed'
import { finishProvisionedSite, type GroupDeployment } from './finish'
import { validateProvisionSchema } from './schema'
import { provisionSite, type ProvisionMode } from './provision'
import { provisionBrowserAcceptance } from './acceptance'
import { workersCiCommit } from '../workers-ci-identity.mjs'
import { verifyProvisionAdmissionHandoff } from './admission'

assert.equal(process.env.WORKERS_CI,'1'); assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH ?? ''))
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(workersCiCommit(),commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.ok(process.env.SITE_PROVISION_REQUEST && ['dry-run','apply'].includes(process.env.SITE_PROVISION_MODE ?? ''))
const rawRequest: unknown = JSON.parse(readFileSync(process.env.SITE_PROVISION_REQUEST,'utf8'))
const request = parseProvisionRequest(rawRequest)
const { plan,baseline,central } = request,mode = process.env.SITE_PROVISION_MODE as ProvisionMode
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,plan.accountId)
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME,undefined); assert.equal(process.env.WRANGLER_CI_MATCH_TAG,undefined)
const schema = JSON.parse(readFileSync('.cloudflare-ci/role-site-a-schema.json','utf8')) as RoleSchema
validateProvisionSchema(plan,schema)
assert.ok(existsSync('.cloudflare-ci/roles/site/.open-next/worker.js'),'Checked site role artifact required')
const api = new ProvisionCloudflare(plan.accountId,process.env.CLOUDFLARE_API_TOKEN ?? ''),group = new ProvisionGroup(api,request)
await group.resources()
const directory = resolve('.cloudflare-ci/provision',plan.operationId)
mkdirSync(directory,{ recursive: true })
const proxyConfig = (databases: { binding: string; database_name: string; database_id: string }[]) => ({
  name: 'payload-wnam-provision-maintenance',account_id: plan.accountId,compatibility_date: baseline.compatibility_date,
  compatibility_flags: baseline.compatibility_flags,d1_databases: databases.map(db => ({ ...db,remote: true })),
})
const centralConfig = resolve(directory,'central.json')
writeFileSync(centralConfig,JSON.stringify({ ...proxyConfig(central.d1_databases),
  r2_buckets: [...central.r2_buckets,...baseline.r2_buckets].map(bucket => ({ ...bucket,remote: true })) }))
const proxy = await getPlatformProxy({ configPath: centralConfig,remoteBindings: true,persist: false })
const database = proxy.env.CENTRAL_D1 as D1Database,journal = new ProvisionJournal(database,{ accountId: plan.accountId,centralDatabaseId: plan.centralDatabaseId })
type InspectionEnvironment = { INSPECT: { inspect: (siteId: string,operationId: string) => ReturnType<typeof inspectProvisionedSite> } }
let inspection: { env: InspectionEnvironment; dispose: () => Promise<void> } | undefined
const manifest = async (): Promise<GroupManifest | undefined> => {
  const operation = await journal.read(plan.operationId)
  return operation?.databaseId ? provisionManifest(request,operation.databaseId) : undefined
}
const inspect = async () => group.inspect(await manifest())
const preflight = async () => {
  if (process.env.SITE_PROVISION_ADMISSION_ID) await verifyProvisionAdmissionHandoff(database,process.env.SITE_PROVISION_ADMISSION_ID,rawRequest,mode)
  await journal.preview(plan)
  const target = await manifest(),routes = groupRoutes(target ?? baseline)
  if (target) assert.equal((await api.database(target.d1_databases.at(-1)!.database_id)).name,plan.databaseName)
  const registered = (await database.prepare('SELECT site_id,local_site_id,database_id,binding_name,schema_version FROM site_runtime_registry WHERE worker_group=?').bind(plan.workerGroup)
    .all<{ site_id: string; local_site_id: number; database_id: string; binding_name: string; schema_version: number }>()).results
  for (const row of registered) {
    const route = routes.find(route => route.siteId === row.site_id)
    assert.ok(route,'Reviewed manifest omits a registered site')
    assert.deepEqual(route,{ siteId: row.site_id,localSiteId: row.local_site_id,databaseId: row.database_id,bindingName: row.binding_name,schemaVersion: row.schema_version })
  }
  for (const route of groupRoutes(baseline)) assert.ok(registered.some(row => row.site_id === route.siteId),'Baseline site is not registered')
  await inspect()
}
const openDatabase = async (id: string) => {
  const configPath = resolve(directory,'site.json')
  writeFileSync(configPath,JSON.stringify(proxyConfig([{ binding: 'PROVISION_D1',database_name: plan.databaseName,database_id: id }])))
  const resource = await getPlatformProxy({ configPath,remoteBindings: true,persist: false })
  return { database: resource.env.PROVISION_D1 as D1Database,close: () => resource.dispose() }
}
const seed = async (mode: ProvisionMode) => {
  const operation = await journal.read(plan.operationId); assert.ok(operation?.databaseId)
  assert.equal((await api.database(operation.databaseId)).name,plan.databaseName)
  const resource = await openDatabase(operation.databaseId)
  let centralPayload: Payload | undefined,sitePayload: Payload | undefined
  try {
    const unavailable = async () => { throw new Error('External capability unavailable during provision seed') }
    // These isolated Local API instances create site/tenant records, not auth
    // records or tokens. No deployed signing secret is read or rotated.
    const secret = randomBytes(32).toString('hex')
    centralPayload = await getPayload({ key: `provision-central-${plan.operationId}`,disableOnInit: true,config: await createCentralPayloadConfig({
      database,bucket: proxy.env.CENTRAL_MEDIA as R2Bucket,secret,generationModels: [],authorizeAiGeneration: unavailable }) })
    sitePayload = await getPayload({ key: `provision-site-${plan.operationId}`,disableOnInit: true,config: await createSitePayloadConfig({ secret,
      identity: { authenticate: unavailable,redeem: unavailable,logout: unavailable },publicBucket: proxy.env.SITE_PUBLIC as R2Bucket,
      privateBucket: proxy.env.SITE_PRIVATE as R2Bucket,generationModels: [],authorizeAiGeneration: unavailable,executeExternalTask: unavailable }) })
    return await seedProvisionedSite(plan,mode,{ journal,centralDatabase: database,siteDatabase: resource.database,centralPayload,sitePayload,preflight })
  } finally { await sitePayload?.destroy(); await centralPayload?.destroy(); await resource.close() }
}
const deploy = async (guard: () => Promise<void>) => {
  const target = await manifest(); assert.ok(target)
  await guard(); await group.resources(); await preflight()
  assert.equal(await inspect(),null,'Provision upload requires the reviewed baseline')
  const configPath = resolve(directory,'target.json'),cwd = resolve('.cloudflare-ci/roles/site')
  // Wrangler resolves main/assets relative to the config. Keep the actual
  // deploy config next to the checked role artifact, export the plain manifest.
  writeFileSync(configPath,JSON.stringify(target,null,2))
  const deployConfig = resolve(cwd,'wrangler.provision.jsonc')
  const selectedDelivery = p1DataDeliverySelection()
  const deployedTarget = plan.workerGroup === selectedDelivery.workerGroup ? p1DataDeliverySiteManifest(target,selectedDelivery) : target
  writeFileSync(deployConfig,JSON.stringify({ ...deployedTarget,vars: { ...deployedTarget.vars,PROVISION_OPERATION: plan.operationId,
    PROVISION_MANIFEST: provisionDigest(JSON.stringify(target)),PROVISION_COMMIT: commit } },null,2))
  await guard()
  await new Promise<void>((resolve,reject) => {
    const child = spawn('pnpm',['exec','opennextjs-cloudflare','deploy','--config',deployConfig],{ cwd,env: process.env,stdio: 'inherit' })
    child.on('error',reject); child.on('exit',code => code === 0 ? resolve() : reject(new Error(`Provision deployment subprocess failed (${code})`)))
  })
  await guard()
}
const verify = async (deployment: GroupDeployment) => {
  if (!inspection) {
    const configPath = resolve(directory,'inspection.json')
    writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-provision-inspection',account_id: plan.accountId,
      compatibility_date: baseline.compatibility_date,compatibility_flags: baseline.compatibility_flags,
      services: [{ binding: 'INSPECT',service: plan.workerName,entrypoint: 'SiteProvisionInspectionService',remote: true }] }))
    inspection = await getPlatformProxy<InspectionEnvironment>({ configPath,remoteBindings: true,persist: false })
  }
  for (let attempt = 1; attempt <= 96; attempt++) {
    try {
      assert.deepEqual(await inspect(),{ ...deployment,operationId: plan.operationId })
      const proof = await inspection.env.INSPECT.inspect(plan.siteId,plan.operationId)
      const operation = await journal.read(plan.operationId)
      for (const [key,value] of Object.entries({ siteId: plan.siteId,operationId: plan.operationId,releaseCommit: deployment.commit,databaseId: operation?.databaseId,
        bindingName: plan.bindingName,localSiteId: plan.localSiteId,tenantId: plan.tenantId,centralTenantId: String(plan.tenantId),ownerUserId: String(plan.ownerUserId),
        schemaDigest: plan.schemaDigest,schemaVersion: plan.schemaVersion })) assert.equal(proof[key as keyof typeof proof],value)
      const domains = (await api.request<{ hostname: string; service: string; zone_id: string }[]>('workers/domains')).result
      const domain = domains.find(d => d.hostname === plan.adminHost)
      assert.equal(domain?.service,plan.workerName); assert.equal(domain?.zone_id,request.zoneId)
      const response = await fetch(`https://${plan.adminHost}/admin/login`,{ redirect: 'manual',signal: AbortSignal.timeout(10000) })
      assert.equal(response.status,proof.state === 'active' ? 303 : 503)
      if (proof.state === 'active') assert.equal(response.headers.get('location'),`${plan.centralOrigin}/admin`)
      await response.body?.cancel()
      return { ...proof,deploymentId: deployment.deploymentId }
    } catch (error) {
      if (attempt === 96) throw error
      console.log(JSON.stringify({ event: 'provision_verification_wait',operationId: plan.operationId,attempt,reason: error instanceof Error ? error.name : 'error' }))
      await new Promise(resolve => setTimeout(resolve,5000))
    }
  }
  throw new Error('Provision verification unavailable')
}
const finish = async (mode: ProvisionMode) => {
  const target = await manifest(); assert.ok(target)
  return finishProvisionedSite(plan,mode,{ journal,centralDatabase: database,manifestDigest: provisionDigest(JSON.stringify(target)),preflight,
    currentDeployment: inspect,deploy,verify,acceptance: () => provisionBrowserAcceptance(plan) })
}
try {
  await preflight()
  const before = await journal.read(plan.operationId)
  if (mode === 'apply' && !before?.completedAt) {
    assert.ok(process.env.SITE_PROVISION_EMAIL && process.env.SITE_PROVISION_PASSWORD,'Cloud owner credentials required before provisioning effects')
    assert.equal(await database.prepare('SELECT email FROM users WHERE id=?').bind(plan.ownerUserId).first('email'),process.env.SITE_PROVISION_EMAIL,'Provision acceptance owner mismatch')
    Object.assign(process.env,browserLibraryEnvironment())
  }
  const result = await provisionSite(plan,mode,{ journal,
    prepare: mode => prepareSiteDatabase(plan,schema,mode,{ journal,api,preflight,openDatabase }),seed,finish,
    verifyCompleted: async () => {
      await finish('dry-run')
      const actual = await inspect(); assert.ok(actual)
      const { operationId: _operation,...deployment } = actual
      const proof = await verify(deployment); assert.equal(proof.state,'active')
      return proof
    },
  })
  if (!result.mutations) assert.deepEqual(await journal.read(plan.operationId),before,'Read-only provision command changed journal')
  const target = await manifest()
  if (target) writeFileSync(resolve(directory,'target.json'),JSON.stringify(target,null,2))
  const report = { event: 'site_provision_completed',commit,mode,checkedAt: new Date().toISOString(),...result,
    ...(process.env.SITE_PROVISION_ADMISSION_ID ? { admissionRequestId: process.env.SITE_PROVISION_ADMISSION_ID } : {}) }
  writeFileSync(resolve(directory,`${mode}.json`),JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
} finally { await inspection?.dispose(); await proxy.dispose() }
process.exit(0)
