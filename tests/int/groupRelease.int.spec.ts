// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import { migrateSiteControl } from '../../src/site-control/schema'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionPlan,provisionDigest } from '../../src/site-control/provisionPlan'
import { GroupReleaseJournal,groupReleaseId,type GroupLease,type GroupReleaseReceipt } from '../../src/site-control/groupReleaseJournal'
import { releaseGroup,type ReleaseSnapshot } from '../../scripts/site-operations/release'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
const target = { accountId: 'd487cf34c606620b442632a72272014d',centralDatabaseId: randomUUID() },commit = 'd'.repeat(40),manifest = '{"reviewed":"group"}'
const manifestDigest = provisionDigest(manifest),noop = async () => {}
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> },db: D1Database,groups: GroupReleaseJournal,provisions: ProvisionJournal,index = 0
const plan = (workerGroup: string) => provisionPlan({ ...target,operationId: randomUUID(),centralOrigin: 'https://p1-hub.beginos.org',
  siteId: `group-test-${++index}`,localSiteId: index,name: 'Group test',tenantId: 1,ownerUserId: 7,workerGroup,workerName: 'payload-wnam-p1-sites',workerTag: 'a'.repeat(32),
  expectedDeploymentId: randomUUID(),baselineManifestDigest: 'b'.repeat(64),bindingName: 'SITE_D1_NEW',schemaVersion: 1,schemaDigest: 'c'.repeat(64),timezone: 'UTC' })
function fixture(workerGroup: string) {
  let uploads = 0,acceptances = 0
  let current: ReleaseSnapshot = { deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest,commit: 'e'.repeat(40),releaseId: null }
  const deps = { journal: groups,current: async () => current,preflight: noop,
    deploy: async (guard: () => Promise<void>,releaseId: string) => { await guard(); uploads++; current = { deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest,commit,releaseId } },
    verify: async (receipt: GroupReleaseReceipt) => { expect(current).toEqual(receipt) },acceptance: async () => { acceptances++ } }
  return { workerGroup,deps,counts: () => ({ uploads,acceptances }) }
}
describe('ordinary group releases and provisioning share native D1 exclusion',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY)'),db.prepare('CREATE TABLE tenants (id INTEGER PRIMARY KEY)'),
      db.prepare('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT)'),db.prepare('INSERT INTO users VALUES (7)'),db.prepare('INSERT INTO tenants VALUES (1)')])
    await migrateSiteControl(db); groups = new GroupReleaseJournal(db); provisions = new ProvisionJournal(db,target)
  })
  afterAll(async () => { await mf?.dispose() })
  it('admits only one winner when a group upload and new provision race',async () => {
    const p = plan('race')
    const results = await Promise.allSettled([groups.claim('race'),provisions.reserve(p)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    for (const result of results) if (result.status === 'fulfilled' && 'owner' in result.value) await groups.release(result.value as GroupLease)
  })
  it('keeps unknown uploads exclusive after expiry and fences a stale release owner',async () => {
    const lease = await groups.claim('fence'),p = plan('fence')
    await expect(provisions.preview(p)).rejects.toThrow('busy')
    const row = await groups.begin(lease,{ commit,manifest,expectedDeploymentId: randomUUID() })
    await db.prepare("UPDATE site_group_leases SET lease_until=0 WHERE worker_group='fence'").run()
    await expect(provisions.reserve(p)).rejects.toThrow('reservation conflict')
    const successor = await groups.claim('fence')
    const receipt = { releaseId: row.releaseId,deploymentId: randomUUID(),versionId: randomUUID(),manifestDigest,commit }
    await expect(groups.heartbeat(lease)).rejects.toThrow('lease lost')
    await expect(groups.uploaded(lease,receipt)).rejects.toThrow('lease lost')
    await groups.release(lease)
    expect(await db.prepare("SELECT lease_owner FROM site_group_leases WHERE worker_group='fence'").first('lease_owner')).toBe(successor.owner)
    await groups.uploaded(successor,receipt); await groups.finish(successor,row.releaseId); await groups.release(successor)
    expect(await provisions.reserve(p)).toMatchObject({ checkpoint: 0 })
    await expect(groups.claim('fence')).rejects.toThrow('provision pending')
  })
  it('reconciles a lost upload receipt once and preserves it on completed reentry',async () => {
    const f = fixture('reconcile'),id = groupReleaseId(f.workerGroup,commit,manifestDigest)
    await expect(releaseGroup(f.workerGroup,commit,manifest,{ ...f.deps,afterDeploy: async () => { throw new Error('Injected lost group upload result') } })).rejects.toThrow('Injected lost')
    expect(await groups.read(id)).toMatchObject({ receipt: null,completedAt: null })
    expect(await releaseGroup(f.workerGroup,commit,manifest,f.deps)).toMatchObject({ uploaded: false,reused: false })
    const receipt = await groups.read(id)
    expect(await releaseGroup(f.workerGroup,commit,manifest,f.deps)).toMatchObject({ uploaded: false,reused: true })
    expect(await groups.read(id)).toEqual(receipt); expect(f.counts()).toEqual({ uploads: 1,acceptances: 1 })
  })
  it('never replays an unknown result or starts another commit over its unresolved intent',async () => {
    const f = fixture('unknown'); let attempts = 0
    const deps = { ...f.deps,deploy: async () => { attempts++; throw new Error('Unknown upload') } }
    await expect(releaseGroup(f.workerGroup,commit,manifest,deps)).rejects.toThrow('Unknown upload')
    await expect(releaseGroup(f.workerGroup,commit,manifest,deps)).rejects.toThrow('no upload was replayed')
    await expect(releaseGroup(f.workerGroup,'f'.repeat(40),manifest,deps)).rejects.toThrow('Unresolved group release')
    await expect(provisions.reserve(plan(f.workerGroup))).rejects.toThrow('reservation conflict')
    expect(attempts).toBe(1)
  })
  it('abandons a pre-upload intent only while the expected deployment is still current',async () => {
    const workerGroup = 'not-uploaded',expectedDeploymentId = randomUUID(),lease = await groups.claim(workerGroup)
    const row = await groups.begin(lease,{ commit,manifest,expectedDeploymentId })
    await expect(groups.abandonUnuploaded(lease,row.releaseId,randomUUID())).rejects.toThrow('cannot be abandoned')
    expect(await groups.pending(workerGroup)).toMatchObject({ releaseId: row.releaseId,receipt: null })
    await groups.abandonUnuploaded(lease,row.releaseId,expectedDeploymentId)
    expect(await groups.pending(workerGroup)).toBeNull()
    await groups.release(lease)
  })
  it('leaves failed acceptance pending and resumes it without another upload',async () => {
    const f = fixture('acceptance'),id = groupReleaseId(f.workerGroup,commit,manifestDigest)
    await expect(releaseGroup(f.workerGroup,commit,manifest,{ ...f.deps,acceptance: async () => { throw new Error('Acceptance failed') } })).rejects.toThrow('Acceptance failed')
    expect((await groups.read(id))?.receipt).not.toBeNull(); expect((await groups.read(id))?.completedAt).toBeNull()
    expect(await releaseGroup(f.workerGroup,commit,manifest,f.deps)).toMatchObject({ uploaded: false })
    expect(f.counts().uploads).toBe(1)
  })
  it('enforces a combined limit of four active group and provision leases',async () => {
    const leases: GroupLease[] = []
    const p = plan('provision-capacity')
    await provisions.reserve(p)
    try {
      for (let n = 0; n < 4; n++) leases.push(await groups.claim(`capacity-${n}`))
      await expect(provisions.claim(p.operationId)).rejects.toThrow('capacity exhausted')
      await expect(groups.claim('fifth')).rejects.toThrow('capacity exhausted')
      await groups.release(leases.pop()!)
      const provisionLease = await provisions.claim(p.operationId)
      await expect(groups.claim('still-fifth')).rejects.toThrow('capacity exhausted')
      await provisions.release(provisionLease)
    } finally { for (const lease of leases) await groups.release(lease) }
  })
})
