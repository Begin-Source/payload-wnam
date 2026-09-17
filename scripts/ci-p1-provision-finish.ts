import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { ProvisionJournal } from '../src/site-control/provisionJournal'
import { provisionDigest } from '../src/site-control/provisionPlan'
import { ProvisionCloudflare } from './site-operations/cloudflare'
import { finishProvisionedSite, type GroupDeployment } from './site-operations/finish'
import { p1Manifests, p1BaseManifests, P1_ACCOUNT } from './p1-manifests.mjs'
import { browserLibraryEnvironment } from './ci-browser-libs.mjs'
import type { inspectProvisionedSite } from '../src/site-runtime/provisionInspection'

const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1')
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit); assert.equal(process.env.P1_SITE_FINISH,'1')
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
const { central,site } = p1Manifests(),base = p1BaseManifests().site
const centralId = central.d1_databases[0].database_id as string
const api = new ProvisionCloudflare(P1_ACCOUNT,process.env.CLOUDFLARE_API_TOKEN ?? '')
const operationId = 'f8d779c3-12a4-491c-b368-00f274be2bfd'
const manifestDigest = provisionDigest(JSON.stringify(site))
type Binding = { name: string; type: string; id?: string; text?: string; bucket_name?: string; service?: string; entrypoint?: string }
type Deployment = { id: string; versions: { version_id: string; percentage: number }[] }
const activeDeployment = async () => (await api.request<{ deployments: Deployment[] }>(`workers/scripts/${site.name}/deployments`)).result.deployments[0]
const run = (command: string,args: string[],cwd = process.cwd(),extra: NodeJS.ProcessEnv = {}) => new Promise<void>((resolve,reject) => {
  const child = spawn(command,args,{ cwd,env: { ...process.env,...extra },stdio: 'inherit' })
  child.on('error',reject); child.on('exit',code => code === 0 ? resolve() : reject(new Error(`Cloud provision subprocess failed (${code})`)))
})
const settings = async () => (await api.request<{ bindings: Binding[]; compatibility_date: string; compatibility_flags: string[] }>(`workers/scripts/${site.name}/settings`)).result
const inspectGroup = async () => {
  const before = await activeDeployment(),actual = await settings()
  assert.equal(actual.compatibility_date,site.compatibility_date)
  assert.deepEqual([...actual.compatibility_flags].sort(),[...site.compatibility_flags].sort())
  const hasC = actual.bindings.some(binding => binding.name === 'SITE_D1_C'),expected = hasC ? site : base
  const bindings: Binding[] = [
    { name: 'ASSETS',type: 'assets' },{ name: 'PAYLOAD_SECRET',type: 'secret_text' },
    ...expected.d1_databases.map((db: { binding: string; database_id: string }) => ({ name: db.binding,type: 'd1',id: db.database_id })),
    ...expected.r2_buckets.map((bucket: { binding: string; bucket_name: string }) => ({ name: bucket.binding,type: 'r2_bucket',bucket_name: bucket.bucket_name })),
    ...expected.services.map((service: { binding: string; service: string; entrypoint: string }) => ({ name: service.binding,type: 'service',service: service.service,entrypoint: service.entrypoint })),
    ...Object.entries(expected.vars).map(([name,text]) => ({ name,type: 'plain_text',text: text as string })),
  ]
  const provenance = ['PROVISION_OPERATION','PROVISION_MANIFEST','PROVISION_COMMIT']
  const normalize = (b: Binding) => ({ name: b.name,type: b.type,...(b.type === 'plain_text' ? { text: b.text } : {}),
    ...(b.type === 'd1' ? { id: b.id } : {}),...(b.type === 'r2_bucket' ? { bucket_name: b.bucket_name } : {}),
    ...(b.type === 'service' ? { service: b.service,entrypoint: b.entrypoint } : {}) })
  assert.deepEqual(actual.bindings.filter(b => !provenance.includes(b.name)).map(normalize).sort((a,b) => a.name.localeCompare(b.name)),bindings.map(normalize).sort((a,b) => a.name.localeCompare(b.name)))
  const subdomain = (await api.request<{ enabled: boolean; previews_enabled: boolean }>(`workers/scripts/${site.name}/subdomain`)).result
  assert.deepEqual(subdomain,{ enabled: false,previews_enabled: false })
  const after = await activeDeployment(); assert.equal(before.id,after.id,'Group changed during inspection')
  assert.equal(after.versions.length,1); assert.equal(after.versions[0].percentage,100)
  if (!hasC) { assert.ok(!actual.bindings.some(b => provenance.includes(b.name))); return null }
  const value = (name: string) => { const found = actual.bindings.filter(b => b.name === name && b.type === 'plain_text'); assert.equal(found.length,1); return found[0].text! }
  assert.equal(value('PROVISION_OPERATION'),operationId); assert.equal(value('PROVISION_MANIFEST'),manifestDigest)
  assert.match(value('PROVISION_COMMIT'),/^[a-f0-9]{40}$/)
  return { deploymentId: after.id,versionId: after.versions[0].version_id,manifestDigest,commit: value('PROVISION_COMMIT'),operationId }
}
const preflight = async () => {
  assert.equal((await api.database(centralId)).name,'payload-wnam-p1-central')
  const workers = (await api.request<{ id: string; tag: string }[]>('workers/scripts')).result
  assert.equal(workers.find(w => w.id === site.name)?.tag,'e73dabad443148d1a6cede5c19ee203e')
  await inspectGroup()
}
await preflight()
writeFileSync('.cloudflare-ci/provision-finish-central.json',JSON.stringify({ name: 'payload-wnam-provision-finish',account_id: P1_ACCOUNT,
  compatibility_date: site.compatibility_date,compatibility_flags: site.compatibility_flags,
  d1_databases: [{ ...central.d1_databases[0],remote: true }] }))
const proxy = await getPlatformProxy({ configPath: '.cloudflare-ci/provision-finish-central.json',remoteBindings: true,persist: false })
let inspectionProxy: Awaited<ReturnType<typeof getPlatformProxy>> | undefined
const database = proxy.env.CENTRAL_D1 as D1Database,journal = new ProvisionJournal(database,{ accountId: P1_ACCOUNT,centralDatabaseId: centralId })
try {
  const plan = await journal.plan(operationId)
  assert.ok(plan && plan.siteId === 'p1-c' && plan.localSiteId === 103 && plan.ownerUserId === 7 && plan.tenantId === 1)
  assert.equal(plan.baselineManifestDigest,provisionDigest(JSON.stringify(base)))
  assert.equal(plan.workerName,site.name); assert.equal(plan.workerGroup,site.vars.WORKER_GROUP)
  const operation = await journal.read(operationId)
  assert.equal(operation?.databaseId,site.d1_databases[2].database_id)
  assert.equal((await api.database(operation!.databaseId!)).name,plan.databaseName)
  const deploy = async (guard: () => Promise<void>) => {
    await guard()
    const before = await activeDeployment(),cwd = resolve('.cloudflare-ci/roles/site'),configPath = resolve(cwd,'wrangler.p1.jsonc')
    const target = { ...site,vars: { ...site.vars,PROVISION_OPERATION: operationId,PROVISION_MANIFEST: manifestDigest,PROVISION_COMMIT: commit } }
    writeFileSync(configPath,JSON.stringify(target,null,2))
    await preflight(); assert.equal((await activeDeployment()).id,before.id,'Group changed before upload')
    await guard()
    // Existing secret is preserved by Wrangler; no second secret deployment can
    // split this operation's receipt from its actual code/binding version.
    await run('pnpm',['exec','opennextjs-cloudflare','deploy','--config',configPath],cwd)
    await guard()
  }
  const verify = async (deployment: GroupDeployment) => {
    if (!inspectionProxy) {
      writeFileSync('.cloudflare-ci/provision-inspection.json',JSON.stringify({ name: 'payload-wnam-provision-inspection',account_id: P1_ACCOUNT,
        compatibility_date: site.compatibility_date,compatibility_flags: site.compatibility_flags,
        services: [{ binding: 'INSPECT',service: site.name,entrypoint: 'SiteProvisionInspectionService',remote: true }] }))
      inspectionProxy = await getPlatformProxy({ configPath: '.cloudflare-ci/provision-inspection.json',remoteBindings: true,persist: false })
    }
    let proof: Awaited<ReturnType<typeof inspectProvisionedSite>> | undefined
    for (let attempt = 1; attempt <= 96; attempt++) {
      try {
        assert.deepEqual(await inspectGroup(),{ ...deployment,operationId })
        proof = await (inspectionProxy.env.INSPECT as { inspect: (siteId: string,operationId: string) => ReturnType<typeof inspectProvisionedSite> }).inspect(plan.siteId,operationId)
        for (const [key,value] of Object.entries({ siteId: plan.siteId,operationId,releaseCommit: deployment.commit,databaseId: operation!.databaseId,bindingName: plan.bindingName,
          localSiteId: plan.localSiteId,tenantId: plan.tenantId,centralTenantId: String(plan.tenantId),ownerUserId: String(plan.ownerUserId),schemaDigest: plan.schemaDigest,schemaVersion: plan.schemaVersion })) {
          assert.equal(proof[key as keyof typeof proof],value)
        }
        const domains = (await api.request<{ hostname: string; service: string }[]>('workers/domains')).result
        assert.equal(domains.find(d => d.hostname === plan.adminHost)?.service,site.name)
        const response = await fetch(`https://${plan.adminHost}/admin/login`,{ redirect: 'manual',signal: AbortSignal.timeout(10000) })
        assert.equal(response.status,proof.state === 'active' ? 303 : 503)
        if (proof.state === 'active') assert.equal(response.headers.get('location'),`${plan.centralOrigin}/admin`)
        await response.body?.cancel()
        console.log(JSON.stringify({ event: 'p1_provision_binding_verified',attempt,...proof,deploymentId: deployment.deploymentId }))
        return { ...proof,deploymentId: deployment.deploymentId }
      } catch (error) {
        console.log(JSON.stringify({ event: 'p1_provision_verification_wait',attempt,reason: error instanceof Error ? error.name : 'error' }))
        if (attempt === 96) throw error
        await new Promise(resolve => setTimeout(resolve,5000))
      }
    }
    throw new Error('Provision verification unavailable')
  }
  const acceptance = async () => { await run(process.execPath,['scripts/ci-p1-smoke.mjs'],process.cwd(),browserLibraryEnvironment()) }
  const deps = { journal,centralDatabase: database,manifestDigest,preflight,currentDeployment: inspectGroup,deploy,verify,acceptance }
  const before = await journal.read(operationId),preview = await finishProvisionedSite(plan,'dry-run',deps)
  assert.deepEqual(await journal.read(operationId),before)
  console.log(JSON.stringify({ event: 'p1_provision_finish_preview',...preview }))
  let result
  if (before?.completedAt) {
    // Future ordinary releases retain the C source manifest and do not alter
    // completed provisioning receipts or reset its routing version.
    await deploy(async () => {})
    await acceptance()
    result = await finishProvisionedSite(plan,'apply',deps)
  } else result = await finishProvisionedSite(plan,'apply',deps)
  const actual = await inspectGroup(); assert.ok(actual)
  const report = { event: 'p1_provision_activation_passed',commit,checkedAt: new Date().toISOString(),...result,
    deployed: { role: 'site',worker: site.name,deployment: actual.deploymentId,versions: [{ version_id: actual.versionId,percentage: 100 }] },
    resumed: before?.checkpoint !== 3 || before?.pendingStep !== null,ordinaryRelease: Boolean(before?.completedAt) }
  writeFileSync('.cloudflare-ci/p1-provision-activation.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
} finally { await inspectionProxy?.dispose(); await proxy.dispose() }
process.exit(0)
