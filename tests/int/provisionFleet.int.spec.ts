// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync,realpathSync } from 'node:fs'
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest'
import { migrateSiteControl } from '../../src/site-control/schema'
import { ProvisionJournal,provisionSteps } from '../../src/site-control/provisionJournal'
import { GroupReleaseJournal,groupReleaseId } from '../../src/site-control/groupReleaseJournal'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { registerSite } from '../../src/site-control/registry'
import { parseProvisionRequest,provisionManifest,type GroupManifest } from '../../scripts/site-operations/manifest'
import { resolveProvisionFleet,releaseProvisionFleet } from '../../scripts/site-operations/fleet'
import type { ReleaseSnapshot } from '../../scripts/site-operations/release'
import { provisionAdmissionSchema } from '../../src/site-control/provisionAdmissionSchema'
import { provisionDispatchSchema } from '../../src/site-control/provisionDispatchSchema'
import { submitProvisionAdmission } from '../../src/site-control/provisionAdmission'
import { planProvisionAdmission,type AdmissionPlannerDependencies } from '../../scripts/site-operations/admission-plan'
import { resolveAdmissionFleet } from '../../scripts/site-operations/admission-fleet'
import { fleetReleaseArtifact,validateFleetReleaseArtifact } from '../../scripts/site-operations/fleet-artifact'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const source = JSON.parse(readFileSync('operations/provision/p1-c.json','utf8'))
const central = structuredClone(source.central),centralId = randomUUID(),commit = 'c'.repeat(40)
central.d1_databases[0].database_id = centralId
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> },db: D1Database,journal: ProvisionJournal

async function admit(siteId: string) {
  const input = { requestId: randomUUID(),siteId,name: `Site ${siteId}`,tenantId: 1,ownerUserId: 7,timezone: 'UTC' }
  await submitProvisionAdmission(db,{ userId: '7',sessionId: 'planner-session' },input)
  return input
}
function planner(fleetInput: unknown): AdmissionPlannerDependencies {
  const deploymentId = randomUUID()
  return { database: db,fleetInput,schema: { version: source.plan.schemaVersion,digest: source.plan.schemaDigest },
    inspect: async group => ({ deploymentId,manifestDigest: group.manifestDigest }) }
}

async function completeRequest(raw: unknown) {
  const request = parseProvisionRequest(raw),plan = request.plan,databaseId = randomUUID(),target = provisionManifest(request,databaseId)
  await journal.reserve(plan)
  const lease = await journal.claim(plan.operationId),deploymentId = randomUUID(),digest = 'a'.repeat(64)
  const receipts = [{ databaseId,databaseName: plan.databaseName,readReplication: 'disabled' },
    { databaseId,schemaDigest: plan.schemaDigest,schemaVersion: plan.schemaVersion,objects: 504 },
    { databaseId,siteId: plan.siteId,localSiteId: plan.localSiteId,tenantId: plan.tenantId,ownerUserId: plan.ownerUserId,contentDigest: digest },
    { deploymentId,versionId: randomUUID(),manifestDigest: provisionDigest(JSON.stringify(target)),commit },
    { deploymentId,reportDigest: digest,checkedAt: new Date().toISOString() },{ siteId: plan.siteId,routingVersion: 2 }]
  for (const [stepIndex,step] of provisionSteps.entries()) {
    await journal.begin(lease,step,digest)
    if (step === 'activate') {
      await registerSite(db,{ siteId: plan.siteId,localSiteId: plan.localSiteId,databaseId,bindingName: plan.bindingName,workerGroup: plan.workerGroup,
        adminHost: plan.adminHost,schemaVersion: 1,routingVersion: 2,migrationState: 'active',timezone: plan.timezone,productionEnabled: false,operationId: plan.operationId })
      await db.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind(plan.siteId,'7','manager').run()
    }
    await journal.finish(lease,step,digest,receipts[stepIndex])
  }
  return target
}

async function fixture(options: { bucketCollision?: boolean; workerCollision?: boolean; groups?: number } = {}) {
  let localId = 1000
  const groups = []
  for (const index of Array.from({ length: options.groups ?? 2 },(_,index) => index+1)) {
    const workerGroup = `fleet-${index}`,workerName = `payload-wnam-fleet-${options.workerCollision ? 1 : index}`
    let baseline: GroupManifest = structuredClone(source.baseline)
    baseline.name = workerName; baseline.routes = []; baseline.d1_databases = []
    baseline.vars.WORKER_GROUP = workerGroup; baseline.vars.SITE_ROUTES = '[]'
    if (index === 2 && options.bucketCollision) baseline.r2_buckets = [
      { binding: 'SITE_PUBLIC',bucket_name: 'payload-wnam-p1-site-private' },{ binding: 'SITE_PRIVATE',bucket_name: 'payload-fleet-other-private' },
    ]
    const requests = []
    for (let n = 1; n <= (index === 1 ? 2 : 1); n++) {
      const raw = { ...structuredClone(source),central,baseline,plan: { ...source.plan,operationId: randomUUID(),centralDatabaseId: centralId,
        siteId: `fleet-${index}-site-${n}`,localSiteId: ++localId,workerGroup,workerName,workerTag: String(index).repeat(32),bindingName: `SITE_D1_${n}`,
        expectedDeploymentId: randomUUID(),baselineManifestDigest: provisionDigest(JSON.stringify(baseline)) } }
      baseline = await completeRequest(raw); requests.push(raw)
    }
    groups.push({ workerGroup,baselineSites: [],requests })
  }
  return { operationId: randomUUID(),groups }
}
describe('provision fleet assembly and ordered native D1 releases',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY,email TEXT,lock_until TEXT)'),db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),
      db.prepare('CREATE TABLE users_sessions (id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)'),
      db.prepare('CREATE TABLE users_roles (parent_id INTEGER,value TEXT)'),db.prepare('CREATE TABLE users_tenants (_parent_id INTEGER,tenant_id INTEGER)'),
      db.prepare("INSERT INTO users_sessions VALUES ('planner-session',7,'2099-01-01')"),
      db.prepare("INSERT INTO users_roles VALUES (7,'super-admin')"),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT UNIQUE)'),db.prepare("INSERT INTO users VALUES (7,'planner@example.invalid',NULL)"),db.prepare('INSERT INTO tenants VALUES (1)')])
    await migrateSiteControl(db)
    await db.batch(provisionAdmissionSchema.map(sql => db.prepare(sql)))
    await db.batch(provisionDispatchSchema.map(sql => db.prepare(sql)))
    journal = new ProvisionJournal(db,{ accountId: source.plan.accountId,centralDatabaseId: centralId })
  })
  beforeEach(async () => {
    for (const table of ['site_provision_build_events','site_provision_dispatches','site_provision_requests','site_group_releases','site_group_leases','site_provision_steps','site_provision_operations','site_runtime_access','site_runtime_registry']) await db.prepare(`DELETE FROM ${table}`).run()
  })
  afterAll(async () => { await mf?.dispose() })
  it('assembles two groups and three completed histories through a read-only database capability',async () => {
    const input = await fixture(),before = await db.prepare('SELECT * FROM site_provision_steps ORDER BY operation_id,step').all()
    const readonly = new Proxy(db,{ get(target,key) {
      if (key === 'prepare') return (sql: string) => { expect(sql.trim().startsWith('SELECT')).toBe(true); return target.prepare(sql) }
      throw new Error(`Write capability ${String(key)} unavailable`)
    } })
    const fleet = await resolveProvisionFleet(input,readonly)
    expect(fleet.groups.map(group => group.manifest.d1_databases.length)).toEqual([2,1])
    expect(fleet.groups[0].verification.sites.map(site => site.siteId)).toEqual(['fleet-1-site-1','fleet-1-site-2'])
    expect(await resolveProvisionFleet(input,readonly)).toEqual(fleet)
    expect((await db.prepare('SELECT * FROM site_provision_steps ORDER BY operation_id,step').all()).results).toEqual(before.results)
  },30000) // Three native six-step histories, verified twice through read-only D1.
  it('refuses omitted and reordered history, changed immutable input and missing registered members',async () => {
    const input = await fixture()
    const omitted = structuredClone(input); omitted.groups[0].requests.pop()
    await expect(resolveProvisionFleet(omitted,db)).rejects.toThrow('registered member')
    const reordered = structuredClone(input); reordered.groups[0].requests.reverse()
    await expect(resolveProvisionFleet(reordered,db)).rejects.toThrow('Baseline ownership')
    const changed = structuredClone(input); changed.groups[0].requests[0].plan.name = 'Changed after completion'
    await expect(resolveProvisionFleet(changed,db)).rejects.toThrow('immutable stored plan')
    await db.prepare("UPDATE site_runtime_registry SET binding_name='SITE_D1_FOREIGN' WHERE site_id='fleet-1-site-1'").run()
    await expect(resolveProvisionFleet(input,db)).rejects.toThrow('registered member')
  })
  it('requires complete receipts and refuses a runtime registration older than activation',async () => {
    const input = await fixture()
    await db.prepare("UPDATE site_runtime_registry SET routing_version=1 WHERE site_id='fleet-1-site-1'").run()
    await expect(resolveProvisionFleet(input,db)).rejects.toThrow('predates provision activation')
    await db.prepare("UPDATE site_runtime_registry SET routing_version=2 WHERE site_id='fleet-1-site-1'").run()
    await db.prepare('DELETE FROM site_provision_steps WHERE operation_id=? AND step=4').bind(input.groups[0].requests[0].plan.operationId).run()
    await expect(resolveProvisionFleet(input,db)).rejects.toThrow('receipt is missing')
  })
  it('rejects cross-group public/private storage aliasing even when each group is individually distinct',async () => {
    await expect(resolveProvisionFleet(await fixture({ bucketCollision: true }),db)).rejects.toThrow('public/private bucket collision')
  })
  it('rejects two group identities targeting the same Worker',async () => {
    await expect(resolveProvisionFleet(await fixture({ workerCollision: true }),db)).rejects.toThrow('multiple fleet groups')
  })
  it('keeps paused sites addressable but blocks migrating or retired group members',async () => {
    const input = await fixture()
    await db.prepare("UPDATE site_runtime_registry SET migration_state='paused' WHERE site_id='fleet-1-site-1'").run()
    expect((await resolveProvisionFleet(input,db)).groups).toHaveLength(2)
    for (const state of ['migrating','retired']) {
      await db.prepare("UPDATE site_runtime_registry SET migration_state=? WHERE site_id='fleet-1-site-1'").bind(state).run()
      await expect(resolveProvisionFleet(input,db)).rejects.toThrow('unavailable site')
    }
  })
  it('plans consecutive admissions from complete current history and retains both in later fleet releases',async () => {
    const input = await fixture(),deps = planner(input)
    const originalReceipts = (await db.prepare('SELECT * FROM site_provision_steps ORDER BY operation_id,step').all()).results
    const first = await admit('admitted-first'),prepared = await planProvisionAdmission(first.requestId,'fleet-1',deps)
    expect(prepared.reused).toBe(false)
    expect(prepared.request.plan).toMatchObject({ localSiteId: 1004,siteId: first.siteId,workerGroup: 'fleet-1',ownerUserId: 7 })
    expect(prepared.request.baseline.d1_databases).toHaveLength(2)
    expect(await planProvisionAdmission(first.requestId,'fleet-1',deps)).toMatchObject({ reused: true,request: prepared.request })
    await completeRequest(prepared.raw)
    const second = await admit('admitted-second'),next = await planProvisionAdmission(second.requestId,'fleet-1',deps)
    expect(next.request.baseline.d1_databases).toHaveLength(3)
    expect(next.request.plan.localSiteId).toBe(1005)
    await completeRequest(next.raw)
    const resolved = await resolveAdmissionFleet(input,db)
    expect(resolved.groups.map(group => group.manifest.d1_databases.length)).toEqual([4,1])
    expect(resolved.groups[0].verification.sites.map(site => site.siteId)).toEqual(['fleet-1-site-1','fleet-1-site-2','admitted-first','admitted-second'])
    expect((await resolveAdmissionFleet(input,db)).groups).toEqual(resolved.groups)
    const artifact = fleetReleaseArtifact(commit,resolved),effective = validateFleetReleaseArtifact(artifact,input,commit)
    expect(effective.groups.map(group => group.manifest)).toEqual(resolved.groups.map(group => group.manifest))
    expect(effective.groups[0].verification.sites).toEqual(resolved.groups[0].verification.sites)
    const releases = new GroupReleaseJournal(db),current = new Map<string,ReleaseSnapshot>(),uploads: string[] = []
    for (const group of resolved.groups) current.set(group.workerGroup,{ deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest: group.manifestDigest,commit: 'd'.repeat(40),releaseId: null })
    let interrupted = true
    const dependencies = (group: typeof resolved.groups[number]) => ({ journal: releases,
      preflight: async () => { expect(await resolveAdmissionFleet(input,db)).toEqual(resolved) },
      current: async () => current.get(group.workerGroup)!,
      deploy: async (guard: () => Promise<void>,releaseId: string) => { await guard(); uploads.push(group.workerGroup)
        expect(effective.groups.find(candidate => candidate.workerGroup === group.workerGroup)!.manifest).toEqual(group.manifest)
        current.set(group.workerGroup,{ deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest: group.manifestDigest,commit,releaseId }) },
      afterDeploy: async () => { if (interrupted) { interrupted = false; throw new Error('Dynamic fleet upload interrupted') } },
      verify: async (receipt: ReleaseSnapshot) => { expect(receipt).toEqual(current.get(group.workerGroup)) },acceptance: async () => {},
    })
    await expect(releaseProvisionFleet(resolved,commit,dependencies,async () => {})).rejects.toThrow('Dynamic fleet upload interrupted')
    const released = await releaseProvisionFleet(resolved,commit,dependencies,async () => {})
    expect(released.map(result => result.uploaded)).toEqual([false,true])
    expect((await releaseProvisionFleet(resolved,commit,dependencies,async () => {})).every(result => result.reused && !result.uploaded)).toBe(true)
    expect(uploads).toEqual(['fleet-1','fleet-2'])
    console.log(JSON.stringify({ event: 'admission_fleet_release_recovery_passed',members: effective.groups.map(group => group.verification.sites.map(site => site.siteId)),uploads,repeatUploaded: false,remoteDeployment: false }))
    expect(await planProvisionAdmission(first.requestId,'fleet-1',deps)).toMatchObject({ reused: true,request: prepared.request })
    for (const receipt of originalReceipts) expect((await db.prepare('SELECT * FROM site_provision_steps WHERE operation_id=? AND step=?')
      .bind(receipt.operation_id,receipt.step).first())).toEqual(receipt)
    await expect(resolveProvisionFleet(input,db)).rejects.toThrow('registered member')
    await db.prepare('DELETE FROM site_provision_steps WHERE operation_id=? AND step=4').bind(second.requestId).run()
    await expect(resolveAdmissionFleet(input,db)).rejects.toThrow('receipt is missing')
  },30000) // Five native operations, complete history checks and two-group upload recovery.
  it('previews through SELECT-only D1, then prepares the same plan and rejects revoked preview authority',async () => {
    const input = await fixture({ groups: 1 }),deps = planner(input),human = await admit('readonly-planning')
    const before = (await db.prepare('SELECT * FROM site_provision_requests').all()).results
    const readonly = new Proxy(db,{ get(target,key) {
      if (key === 'prepare') return (sql: string) => { expect(sql.trim().startsWith('SELECT')).toBe(true); return target.prepare(sql) }
      throw new Error(`Write capability ${String(key)} unavailable`)
    } })
    const preview = await planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,database: readonly },'dry-run')
    expect(preview.mutations).toBe(false); expect(preview.reused).toBe(false)
    expect((await db.prepare('SELECT * FROM site_provision_requests').all()).results).toEqual(before)
    expect(await journal.read(human.requestId)).toBeNull()
    const other = await admit('revoked-preview')
    await db.prepare("UPDATE users_roles SET value='site-manager' WHERE parent_id=7").run()
    try {
      await expect(planProvisionAdmission(other.requestId,'fleet-1',{ ...deps,database: readonly },'dry-run')).rejects.toThrow('lost permission or group is busy')
    } finally { await db.prepare("UPDATE users_roles SET value='super-admin' WHERE parent_id=7").run() }
    expect(await db.prepare('SELECT prepared_request_json FROM site_provision_requests WHERE request_id=?').bind(other.requestId).first('prepared_request_json')).toBeNull()
    const prepared = await planProvisionAdmission(human.requestId,'fleet-1',deps,'prepare')
    expect(prepared.raw).toEqual(preview.raw); expect(prepared.mutations).toBe(true)
    expect(await planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,database: readonly },'dry-run'))
      .toMatchObject({ raw: prepared.raw,reused: true,mutations: false })
  },30000) // Native history plus preview, preparation, resumption and revoked authority.
  it('serializes competing prepared plans in one group while allowing another group to prepare',async () => {
    const input = await fixture(),deps = planner(input),a = await admit('competing-a'),b = await admit('competing-b')
    const outcomes = await Promise.allSettled([a,b].map(value => planProvisionAdmission(value.requestId,'fleet-1',deps)))
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_provision_requests WHERE prepared_request_json IS NOT NULL').first('n')).toBe(1)
    const winner = outcomes.find(value => value.status === 'fulfilled')
    if (winner?.status !== 'fulfilled') throw new Error('Expected one prepared request')
    const other = await admit('other-group'),independent = await planProvisionAdmission(other.requestId,'fleet-2',deps)
    expect(independent.request.plan.workerName).toBe('payload-wnam-fleet-2')
    expect(independent.request.plan.localSiteId).not.toBe(winner.value.request.plan.localSiteId)
    await completeRequest(winner.value.raw)
    const loser = outcomes[0].status === 'rejected' ? a : b
    const retried = await planProvisionAdmission(loser.requestId,'fleet-1',deps)
    expect(retried.request.baseline.d1_databases).toHaveLength(3)
  },30000) // Multiple competing native planners and an intervening completion.
  it('refuses unknown groups, schema changes and stale external bindings without preparing an operation',async () => {
    const input = await fixture(),deps = planner(input),human = await admit('inspection-rejected')
    await expect(planProvisionAdmission(human.requestId,'not-reviewed',deps)).rejects.toThrow('reviewed fleet')
    await expect(planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,schema: { ...deps.schema,version: 2 } })).rejects.toThrow('schema migration')
    await expect(planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,inspect: async () => ({ deploymentId: randomUUID(),manifestDigest: '0'.repeat(64) }) }))
      .rejects.toThrow('Deployed group differs')
    await expect(planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,inspect: async group => {
      await db.prepare("UPDATE site_runtime_registry SET binding_name='SITE_D1_CHANGED' WHERE site_id='fleet-1-site-1'").run()
      return { deploymentId: randomUUID(),manifestDigest: group.manifestDigest }
    } })).rejects.toThrow('registered member')
    expect(await db.prepare('SELECT prepared_request_json FROM site_provision_requests WHERE request_id=?').bind(human.requestId).first('prepared_request_json')).toBeNull()
    expect(await journal.read(human.requestId)).toBeNull()
  },30000) // Three native histories and four rejected planning attempts.
  it('resumes only the exact prepared schema and reviewed group without retargeting',async () => {
    const input = await fixture(),deps = planner(input),human = await admit('resume-identity')
    const prepared = await planProvisionAdmission(human.requestId,'fleet-1',deps)
    await journal.reserve(prepared.request.plan)
    const resumed = await planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,inspect: async () => { throw new Error('Do not replan an owned operation') } })
    expect(resumed.request).toEqual(prepared.request); expect(resumed.reused).toBe(true)
    await expect(planProvisionAdmission(human.requestId,'fleet-2',deps)).rejects.toThrow('another group')
    await expect(planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,schema: { ...deps.schema,digest: 'f'.repeat(64) } })).rejects.toThrow('schema digest changed')
    const changed = structuredClone(input); changed.groups[0].requests[0].plan.workerTag = 'f'.repeat(32)
    await expect(planProvisionAdmission(human.requestId,'fleet-1',{ ...deps,fleetInput: changed })).rejects.toThrow('Worker tag changed')
    expect((await journal.read(human.requestId))?.checkpoint).toBe(0)
  })
  it('stops a batch on failed acceptance and resumes without re-uploading either group',async () => {
    const fleet = await resolveProvisionFleet(await fixture({ groups: 3 }),db),groups = new GroupReleaseJournal(db)
    const uploads = new Map<string,number>(),current = new Map<string,ReleaseSnapshot>(),reported: string[] = []
    let fail = true
    for (const group of fleet.groups) current.set(group.workerGroup,{ deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest: group.manifestDigest,commit: 'd'.repeat(40),releaseId: null })
    const deps = (group: typeof fleet.groups[number]) => ({ journal: groups,preflight: async () => {},current: async () => current.get(group.workerGroup)!,
      deploy: async (guard: () => Promise<void>,releaseId: string) => { await guard(); uploads.set(group.workerGroup,(uploads.get(group.workerGroup) ?? 0)+1)
        current.set(group.workerGroup,{ deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest: group.manifestDigest,commit,releaseId }) },
      verify: async (receipt: ReleaseSnapshot) => { expect(current.get(group.workerGroup)).toEqual(receipt) },
      acceptance: async () => { if (group.workerGroup === 'fleet-2' && fail) throw new Error('Second group acceptance failed') } })
    await expect(releaseProvisionFleet(fleet,commit,deps,async result => { reported.push(result.workerGroup) })).rejects.toThrow('Second group acceptance failed')
    expect(reported).toEqual(['fleet-1'])
    const first = await groups.read(groupReleaseId('fleet-1',commit,fleet.groups[0].manifestDigest))
    expect(first?.completedAt).toBeTruthy()
    expect((await groups.read(groupReleaseId('fleet-2',commit,fleet.groups[1].manifestDigest)))?.completedAt).toBeNull()
    expect(await groups.read(groupReleaseId('fleet-3',commit,fleet.groups[2].manifestDigest))).toBeNull()
    fail = false
    expect((await releaseProvisionFleet(fleet,commit,deps,async () => {})).map(result => ({ uploaded: result.uploaded,reused: result.reused })))
      .toEqual([{ uploaded: false,reused: true },{ uploaded: false,reused: false },{ uploaded: true,reused: false }])
    expect(await groups.read(groupReleaseId('fleet-1',commit,fleet.groups[0].manifestDigest))).toEqual(first)
    expect([...uploads.values()]).toEqual([1,1,1])
  },30000) // Three group histories plus interrupted release and recovery.
})
