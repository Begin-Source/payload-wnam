import assert from 'node:assert/strict'
import { execFileSync,spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { ProvisionJournal } from '../src/site-control/provisionJournal'
import { GroupReleaseJournal,groupReleaseId,type GroupReleaseReceipt } from '../src/site-control/groupReleaseJournal'
import type { inspectSiteRuntime } from '../src/site-runtime/runtimeInspection'
import { ProvisionCloudflare } from './site-operations/cloudflare'
import { ProvisionGroup } from './site-operations/group'
import { groupRoutes,parseProvisionRequest } from './site-operations/manifest'
import { releaseGroup } from './site-operations/release'
import { parseVerificationRequest } from './site-operations/verify-request'
import { p1ReleaseRequest,p1EffectiveManifests } from './p1-release-manifests.mjs'
import { browserLibraryEnvironment } from './ci-browser-libs.mjs'
import { loadProvisionFleet } from './provision-fleet-input.mjs'
import { releaseProvisionFleet } from './site-operations/fleet'
import { resolveAdmissionFleet } from './site-operations/admission-fleet'
import { fleetReleaseArtifact } from './site-operations/fleet-artifact'
import { verifyGroupRuntime } from './site-operations/verify-group-runtime'
import { workersCiCommit } from './workers-ci-identity.mjs'
import { ensureP1DataDeliveryResources,p1DataDeliverySiteManifest } from './p1-data-delivery-resources.mjs'

assert.equal(process.env.WORKERS_CI,'1'); assert.equal(process.env.WORKERS_CI_BRANCH,'feat/site-per-d1'); assert.equal(process.env.P1_GROUP_RELEASE,'1')
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(workersCiCommit(),commit); assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME,undefined); assert.equal(process.env.WRANGLER_CI_MATCH_TAG,undefined)
const selection = p1ReleaseRequest(),anchor = parseProvisionRequest(selection.request),{ plan: anchorPlan,baseline,central } = anchor
const api = new ProvisionCloudflare(anchorPlan.accountId,process.env.CLOUDFLARE_API_TOKEN ?? '')
const dataDeliveryResources = await ensureP1DataDeliveryResources(process.env.CLOUDFLARE_API_TOKEN ?? '')
await new ProvisionGroup(api,anchor).resources()
type Environment = { CENTRAL_D1: D1Database; INSPECT: { verify: (siteId: string) => ReturnType<typeof inspectSiteRuntime> } }
const configPath = '.cloudflare-ci/group-release-proxy.json'
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-group-release-maintenance',account_id: anchorPlan.accountId,
  compatibility_date: baseline.compatibility_date,compatibility_flags: baseline.compatibility_flags,
  d1_databases: central.d1_databases.map(database => ({ ...database,remote: true })),
  services: [{ binding: 'INSPECT',service: anchorPlan.workerName,entrypoint: 'SiteProvisionInspectionService',remote: true }] }))
const proxy = await getPlatformProxy<Environment>({ configPath,remoteBindings: true,persist: false })
const database = proxy.env.CENTRAL_D1,provisions = new ProvisionJournal(database,{ accountId: anchorPlan.accountId,centralDatabaseId: anchorPlan.centralDatabaseId })
const journal = new GroupReleaseJournal(database)
const run = (command: string,args: string[],cwd = process.cwd(),extra: Record<string,string | undefined> = {}) => new Promise<void>((resolve,reject) => {
  const child = spawn(command,args,{ cwd,env: { ...process.env,...extra },stdio: 'inherit' })
  child.on('error',reject); child.on('exit',code => code === 0 ? resolve() : reject(new Error(`Group release subprocess failed (${code})`)))
})
const bounded = async <T>(operation: Promise<T>,milliseconds: number,label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation,new Promise<never>((_,reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)),milliseconds)
    })])
  } finally { if (timer) clearTimeout(timer) }
}
try {
  const fleetInput = loadProvisionFleet('operations/fleet/p1.json')
  const fleet = await resolveAdmissionFleet(fleetInput,database)
  // The reviewed files remain the immutable starting history. Completed
  // admissions extend that history; no file is treated as the latest request.
  assert.equal(fleet.groups.length,1)
  const managed = fleet.groups[0]
  assert.equal(managed.workerGroup,anchorPlan.workerGroup)
  assert.ok(managed.operations.some(operation => operation.operationId === anchorPlan.operationId),'Reviewed P1 anchor missing')
  const request = managed.latestRequest,{ plan } = request,group = new ProvisionGroup(api,request)
  const operation = await provisions.read(plan.operationId)
  assert.ok(operation?.completedAt && operation.checkpoint === 6 && operation.databaseId,'Current provision history must be complete')
  const databaseId = operation.databaseId,site = managed.manifest,manifest = JSON.stringify(site),manifestDigest = managed.manifestDigest
  console.log(JSON.stringify({ event: 'p1_fleet_history_verified',operationId: fleet.operationId,workerGroup: managed.workerGroup,
    manifestDigest,members: groupRoutes(site).map(route => route.siteId),operations: managed.operations,mutations: false }))
  assert.equal((await api.database(databaseId)).name,plan.databaseName)
  const preflight = async () => {
    const current = await resolveAdmissionFleet(fleetInput,database)
    assert.deepEqual(current,fleet,'Fleet history changed during release')
    await group.resources(site)
    const registrations = (await database.prepare('SELECT site_id,local_site_id,binding_name,database_id,schema_version,admin_host FROM site_runtime_registry WHERE worker_group=? ORDER BY site_id')
      .bind(plan.workerGroup).all<{ site_id: string; local_site_id: number; binding_name: string; database_id: string; schema_version: number; admin_host: string }>()).results
    assert.deepEqual(registrations,groupRoutes(site).map(route => ({ site_id: route.siteId,local_site_id: route.localSiteId,binding_name: route.bindingName,
      database_id: route.databaseId,schema_version: route.schemaVersion,admin_host: `cms-site-${route.siteId}.beginos.org` })).sort((a,b) => a.site_id.localeCompare(b.site_id)),
    'Group release would omit or alter a registered member')
    assert.ok(await group.inspect(site))
  }
  await preflight()
  writeFileSync('.cloudflare-ci/p1-effective-site.json',JSON.stringify(fleetReleaseArtifact(commit,fleet),null,2))
  assert.deepEqual((await p1EffectiveManifests()).site,site)
  const deploy = async (guard: () => Promise<void>,releaseId: string) => {
    await guard(); await preflight()
    const cwd = resolve('.cloudflare-ci/roles/site'),path = resolve(cwd,'wrangler.group-release.jsonc')
    const deployedSite = p1DataDeliverySiteManifest(site,dataDeliveryResources)
    writeFileSync(path,JSON.stringify({ ...deployedSite,vars: { ...deployedSite.vars,PROVISION_OPERATION: plan.operationId,PROVISION_MANIFEST: manifestDigest,
      PROVISION_COMMIT: commit,RELEASE_OPERATION: releaseId } },null,2))
    await guard(); await run('pnpm',['exec','opennextjs-cloudflare','deploy','--config',path],cwd); await guard()
  }
  const verify = async (receipt: GroupReleaseReceipt) => {
    for (let attempt = 1; attempt <= 12; attempt++) {
      try {
        assert.deepEqual(await group.releaseSnapshot(site),receipt)
        const proofs = await bounded(verifyGroupRuntime(site,receipt,database,siteId => proxy.env.INSPECT.verify(siteId)),20_000,'P1 group runtime verification')
        assert.deepEqual(await group.releaseSnapshot(site),receipt,'Group changed during member verification')
        console.log(JSON.stringify({ event: 'p1_group_binding_verified',attempt,proofs,releaseId: receipt.releaseId,deploymentId: receipt.deploymentId }))
        return
      } catch (error) {
        if (attempt === 12) throw error
        console.log(JSON.stringify({ event: 'p1_group_verification_wait',attempt,reason: error instanceof Error ? error.name : 'error' }))
        await new Promise(resolve => setTimeout(resolve,5000))
      }
    }
  }
  const verifyCurrentSites = async () => {
    const current = await group.releaseSnapshot(site)
    const verification = parseVerificationRequest({ operationId: randomUUID(),central,centralWorkerTag: request.centralWorkerTag,
      group: site,workerTag: plan.workerTag,zoneId: request.zoneId,schemaDigest: plan.schemaDigest,expectedDeploymentId: current.deploymentId,
      sites: managed.verification.sites })
    const originalTargets = JSON.parse(readFileSync('operations/p1-verify.json','utf8'))
    for (const target of originalTargets) assert.deepEqual(verification.sites.find(site => site.siteId === target.siteId),target,'Original P1 ownership changed')
    assert.deepEqual(verification.sites.map(target => target.siteId),groupRoutes(site).map(route => route.siteId),'P1 verification must include every current member')
    const path = '.cloudflare-ci/site-verify-request.json'
    writeFileSync(path,JSON.stringify(verification,null,2))
    await run('pnpm',['run','site:verify','--request',path])
  }
  const acceptance = async (pendingForwardRecovery = false) => {
    await run(process.execPath,['scripts/ci-p1-smoke.mjs'],process.cwd(),{
      ...browserLibraryEnvironment(),P1_PENDING_FORWARD_RECOVERY: pendingForwardRecovery ? '1' : undefined,
    })
    // A prior runtime is accepted only far enough to close its interrupted
    // journal entry. The current runtime immediately receives the full browser,
    // MCP and six-database acceptance below, avoiding duplicate work that can
    // exceed Cloudflare Builds' total execution limit.
    if (!pendingForwardRecovery) await verifyCurrentSites()
  }
  const deps = { journal,current: () => group.releaseSnapshot(site),preflight,deploy,verify,
    acceptance: () => acceptance() }
  const releaseId = groupReleaseId(plan.workerGroup,commit,manifestDigest),pending = await journal.pending(plan.workerGroup)
  if (selection.reconcile) {
    const selected = await journal.read(selection.reconcile.releaseId)
    assert.ok(selected && selected.workerGroup === plan.workerGroup && selected.commit === selection.reconcile.commit && selected.manifest === manifest,'Reviewed recovery identity mismatch')
    assert.ok(!pending || pending.releaseId === selected.releaseId,'Another pending release occupies this group')
    assert.equal((await deps.current()).releaseId,selected.releaseId,'Reviewed release is no longer deployed')
    const noUpload = { ...deps,deploy: async () => { throw new Error('Reviewed reconciliation cannot upload') } }
    const result = await releaseGroup(plan.workerGroup,selected.commit,selected.manifest,noUpload)
    const receipt = await journal.read(selected.releaseId)
    const repeated = await releaseGroup(plan.workerGroup,selected.commit,selected.manifest,noUpload)
    assert.equal(result.uploaded,false); assert.equal(repeated.uploaded,false); assert.equal(repeated.reused,true)
    assert.deepEqual(await journal.read(selected.releaseId),receipt)
    assert.deepEqual(await provisions.read(plan.operationId),operation)
    const report = { event: 'p1_group_release_passed',checkedAt: new Date().toISOString(),...result,executionCommit: commit,
      reviewedReconciliation: selection.reconcile,repeatReceiptUnchanged: true,provisionOperationUnchanged: plan.operationId,members: groupRoutes(site).map(route => route.siteId) }
    writeFileSync('.cloudflare-ci/p1-group-release.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
  } else {
    if (pending && pending.releaseId !== releaseId) {
      // A newer CI script may finish acceptance of an earlier proven upload. It
      // cannot upload old code or reinterpret a missing source marker as failure.
      assert.equal(pending.manifest,manifest,'Prior group release used a different manifest')
      assert.equal((await deps.current()).releaseId,pending.releaseId,'Prior group upload remains unknown')
      // The already-uploaded prior runtime cannot satisfy a newly added
      // live-to-withdrawn transition check. Recover it with a separate asset
      // that is withdrawn before its first delivery, then immediately deploy
      // and fully validate this commit with the normal transition fixture.
      const recovered = await releaseGroup(plan.workerGroup,pending.commit,pending.manifest,{ ...deps,
        deploy: async () => { throw new Error('Prior release recovery cannot upload') },
        acceptance: () => acceptance(true) })
      console.log(JSON.stringify({ event: 'p1_group_prior_release_recovered',...recovered }))
    }
    const count = await database.prepare('SELECT COUNT(*) AS n FROM site_group_releases WHERE worker_group=?').bind(plan.workerGroup).first<number>('n')
    const inject = count === 0
    if (inject) {
      await assert.rejects(releaseGroup(plan.workerGroup,commit,manifest,{ ...deps,afterDeploy: async () => { throw new Error('P1 injected group upload interruption') } }),/P1 injected group upload interruption/)
      assert.equal((await journal.read(releaseId))?.receipt,null)
      console.log(JSON.stringify({ event: 'p1_group_upload_interrupted',releaseId,workerGroup: plan.workerGroup }))
    }
    const [result] = await releaseProvisionFleet(fleet,commit,() => deps,async result => {
      console.log(JSON.stringify({ event: 'p1_fleet_group_completed',operationId: fleet.operationId,...result }))
    }),receipt = await journal.read(releaseId)
    const [repeated] = await releaseProvisionFleet(fleet,commit,() => deps,async () => {})
    assert.equal(repeated.uploaded,false); assert.equal(repeated.reused,true); assert.deepEqual(await journal.read(releaseId),receipt)
    assert.deepEqual(await provisions.read(plan.operationId),operation,'Ordinary release changed the completed provision operation')
    const report = { event: 'p1_group_release_passed',checkedAt: new Date().toISOString(),...result,resumedAfterInjectedUpload: inject,
      repeatReceiptUnchanged: true,provisionOperationUnchanged: plan.operationId,members: groupRoutes(site).map(route => route.siteId) }
    writeFileSync('.cloudflare-ci/p1-group-release.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
  }
} finally { await proxy.dispose() }
process.exit(0)
