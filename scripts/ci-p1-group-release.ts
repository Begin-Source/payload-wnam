import assert from 'node:assert/strict'
import { execFileSync,spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { ProvisionJournal } from '../src/site-control/provisionJournal'
import { GroupReleaseJournal,groupReleaseId,type GroupReleaseReceipt } from '../src/site-control/groupReleaseJournal'
import { provisionDigest } from '../src/site-control/provisionPlan'
import type { inspectProvisionedSite } from '../src/site-runtime/provisionInspection'
import { ProvisionCloudflare } from './site-operations/cloudflare'
import { ProvisionGroup } from './site-operations/group'
import { groupRoutes,parseProvisionRequest,provisionManifest } from './site-operations/manifest'
import { releaseGroup } from './site-operations/release'
import { parseVerificationRequest } from './site-operations/verify-request'
import { p1ReleaseRequest,p1EffectiveManifests } from './p1-release-manifests.mjs'
import { browserLibraryEnvironment } from './ci-browser-libs.mjs'

assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1'); assert.equal(process.env.P1_GROUP_RELEASE,'1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,commit); assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME,undefined); assert.equal(process.env.WRANGLER_CI_MATCH_TAG,undefined)
const request = parseProvisionRequest(p1ReleaseRequest().request),{ plan,baseline,central } = request
const api = new ProvisionCloudflare(plan.accountId,process.env.CLOUDFLARE_API_TOKEN ?? ''),group = new ProvisionGroup(api,request)
await group.resources()
type Environment = { CENTRAL_D1: D1Database; INSPECT: { inspect: (siteId: string,operationId: string) => ReturnType<typeof inspectProvisionedSite> } }
const configPath = '.cloudflare-ci/group-release-proxy.json'
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-group-release-maintenance',account_id: plan.accountId,
  compatibility_date: baseline.compatibility_date,compatibility_flags: baseline.compatibility_flags,
  d1_databases: central.d1_databases.map(database => ({ ...database,remote: true })),
  services: [{ binding: 'INSPECT',service: plan.workerName,entrypoint: 'SiteProvisionInspectionService',remote: true }] }))
const proxy = await getPlatformProxy<Environment>({ configPath,remoteBindings: true,persist: false })
const database = proxy.env.CENTRAL_D1,provisions = new ProvisionJournal(database,{ accountId: plan.accountId,centralDatabaseId: plan.centralDatabaseId })
const journal = new GroupReleaseJournal(database)
const run = (command: string,args: string[],cwd = process.cwd(),extra: Record<string,string | undefined> = {}) => new Promise<void>((resolve,reject) => {
  const child = spawn(command,args,{ cwd,env: { ...process.env,...extra },stdio: 'inherit' })
  child.on('error',reject); child.on('exit',code => code === 0 ? resolve() : reject(new Error(`Group release subprocess failed (${code})`)))
})
try {
  const original = await provisions.plan(plan.operationId),operation = await provisions.read(plan.operationId)
  assert.deepEqual(original,plan)
  assert.ok(operation?.completedAt && operation.checkpoint === 6 && operation.databaseId,'Selected provision must complete before ordinary group release')
  const databaseId = operation.databaseId,site = provisionManifest(request,databaseId),manifest = JSON.stringify(site),manifestDigest = provisionDigest(manifest)
  assert.equal((await api.database(databaseId)).name,plan.databaseName)
  const preflight = async () => {
    await group.resources()
    const registrations = (await database.prepare('SELECT site_id,local_site_id,binding_name,database_id,schema_version,admin_host FROM site_runtime_registry WHERE worker_group=? ORDER BY site_id')
      .bind(plan.workerGroup).all<{ site_id: string; local_site_id: number; binding_name: string; database_id: string; schema_version: number; admin_host: string }>()).results
    assert.deepEqual(registrations,groupRoutes(site).map(route => ({ site_id: route.siteId,local_site_id: route.localSiteId,binding_name: route.bindingName,
      database_id: route.databaseId,schema_version: route.schemaVersion,admin_host: `cms-site-${route.siteId}.beginos.org` })).sort((a,b) => a.site_id.localeCompare(b.site_id)),
    'Group release would omit or alter a registered member')
    assert.ok(await group.inspect(site))
  }
  await preflight()
  writeFileSync('.cloudflare-ci/p1-effective-site.json',JSON.stringify({ commit,operationId: plan.operationId,databaseId,manifestDigest,site },null,2))
  assert.deepEqual(p1EffectiveManifests().site,site)
  const deploy = async (guard: () => Promise<void>,releaseId: string) => {
    await guard(); await preflight()
    const cwd = resolve('.cloudflare-ci/roles/site'),path = resolve(cwd,'wrangler.group-release.jsonc')
    writeFileSync(path,JSON.stringify({ ...site,vars: { ...site.vars,PROVISION_OPERATION: plan.operationId,PROVISION_MANIFEST: manifestDigest,
      PROVISION_COMMIT: commit,RELEASE_OPERATION: releaseId } },null,2))
    await guard(); await run('pnpm',['exec','opennextjs-cloudflare','deploy','--config',path],cwd); await guard()
  }
  const verify = async (receipt: GroupReleaseReceipt) => {
    for (let attempt = 1; attempt <= 96; attempt++) {
      try {
        assert.deepEqual(await group.releaseSnapshot(site),receipt)
        const proof = await proxy.env.INSPECT.inspect(plan.siteId,plan.operationId)
        for (const [key,value] of Object.entries({ siteId: plan.siteId,operationId: plan.operationId,releaseCommit: receipt.commit,databaseId,
          bindingName: plan.bindingName,localSiteId: plan.localSiteId,tenantId: plan.tenantId,centralTenantId: String(plan.tenantId),ownerUserId: String(plan.ownerUserId),
          schemaDigest: plan.schemaDigest,schemaVersion: plan.schemaVersion,state: 'active' })) assert.equal(proof[key as keyof typeof proof],value)
        console.log(JSON.stringify({ event: 'p1_group_binding_verified',attempt,...proof,releaseId: receipt.releaseId,deploymentId: receipt.deploymentId }))
        return
      } catch (error) {
        if (attempt === 96) throw error
        console.log(JSON.stringify({ event: 'p1_group_verification_wait',attempt,reason: error instanceof Error ? error.name : 'error' }))
        await new Promise(resolve => setTimeout(resolve,5000))
      }
    }
  }
  const verifyCurrentSites = async () => {
    const current = await group.releaseSnapshot(site)
    const verification = parseVerificationRequest({ operationId: randomUUID(),central,centralWorkerTag: request.centralWorkerTag,
      group: site,workerTag: plan.workerTag,zoneId: request.zoneId,schemaDigest: plan.schemaDigest,expectedDeploymentId: current.deploymentId,
      sites: JSON.parse(readFileSync('operations/p1-verify.json','utf8')) })
    assert.deepEqual(verification.sites.map(target => target.siteId),groupRoutes(site).map(route => route.siteId),'P1 verification must include every current member')
    const path = '.cloudflare-ci/site-verify-request.json'
    writeFileSync(path,JSON.stringify(verification,null,2))
    await run('pnpm',['run','site:verify','--request',path])
  }
  const deps = { journal,current: () => group.releaseSnapshot(site),preflight,deploy,verify,
    acceptance: async () => {
      await run(process.execPath,['scripts/ci-p1-smoke.mjs'],process.cwd(),browserLibraryEnvironment())
      await verifyCurrentSites()
    } }
  const releaseId = groupReleaseId(plan.workerGroup,commit,manifestDigest),pending = await journal.pending(plan.workerGroup)
  if (pending && pending.releaseId !== releaseId) {
    // A newer CI script may finish acceptance of an earlier proven upload. It
    // cannot upload old code or reinterpret a missing source marker as failure.
    assert.equal(pending.manifest,manifest,'Prior group release used a different manifest')
    assert.equal((await deps.current()).releaseId,pending.releaseId,'Prior group upload remains unknown')
    const recovered = await releaseGroup(plan.workerGroup,pending.commit,pending.manifest,{ ...deps,deploy: async () => { throw new Error('Prior release recovery cannot upload') } })
    console.log(JSON.stringify({ event: 'p1_group_prior_release_recovered',...recovered }))
  }
  const count = await database.prepare('SELECT COUNT(*) AS n FROM site_group_releases WHERE worker_group=?').bind(plan.workerGroup).first<number>('n')
  const inject = count === 0
  if (inject) {
    await assert.rejects(releaseGroup(plan.workerGroup,commit,manifest,{ ...deps,afterDeploy: async () => { throw new Error('P1 injected group upload interruption') } }),/P1 injected group upload interruption/)
    assert.equal((await journal.read(releaseId))?.receipt,null)
    console.log(JSON.stringify({ event: 'p1_group_upload_interrupted',releaseId,workerGroup: plan.workerGroup }))
  }
  const result = await releaseGroup(plan.workerGroup,commit,manifest,deps),receipt = await journal.read(releaseId)
  const repeated = await releaseGroup(plan.workerGroup,commit,manifest,deps)
  assert.equal(repeated.uploaded,false); assert.equal(repeated.reused,true); assert.deepEqual(await journal.read(releaseId),receipt)
  assert.deepEqual(await provisions.read(plan.operationId),operation,'Ordinary release changed the completed provision operation')
  const report = { event: 'p1_group_release_passed',checkedAt: new Date().toISOString(),...result,resumedAfterInjectedUpload: inject,
    repeatReceiptUnchanged: true,provisionOperationUnchanged: plan.operationId,members: groupRoutes(site).map(route => route.siteId) }
  writeFileSync('.cloudflare-ci/p1-group-release.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
} finally { await proxy.dispose() }
process.exit(0)
