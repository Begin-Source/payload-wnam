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

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const source = JSON.parse(readFileSync('operations/provision/p1-c.json','utf8'))
const central = structuredClone(source.central),centralId = randomUUID(),commit = 'c'.repeat(40)
central.d1_databases[0].database_id = centralId
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> },db: D1Database,journal: ProvisionJournal

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
          await registerSite(db,{ siteId: plan.siteId,localSiteId: plan.localSiteId,databaseId,bindingName: plan.bindingName,workerGroup,
            adminHost: plan.adminHost,schemaVersion: 1,routingVersion: 2,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: plan.operationId })
          await db.prepare('INSERT INTO site_runtime_access VALUES (?,?,?)').bind(plan.siteId,'7','manager').run()
        }
        await journal.finish(lease,step,digest,receipts[stepIndex])
      }
      requests.push(raw); baseline = target
    }
    groups.push({ workerGroup,baselineSites: [],requests })
  }
  return { operationId: randomUUID(),groups }
}
describe('provision fleet assembly and ordered native D1 releases',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)'),db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT UNIQUE)'),db.prepare('INSERT INTO users VALUES (7)'),db.prepare('INSERT INTO tenants VALUES (1)')])
    await migrateSiteControl(db)
    journal = new ProvisionJournal(db,{ accountId: source.plan.accountId,centralDatabaseId: centralId })
  })
  beforeEach(async () => {
    for (const table of ['site_group_releases','site_group_leases','site_provision_steps','site_provision_operations','site_runtime_access','site_runtime_registry']) await db.prepare(`DELETE FROM ${table}`).run()
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
  })
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
  })
})
