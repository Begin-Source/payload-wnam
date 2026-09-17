// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { migrateCentralMasters, migrateSiteMasters } from '../../src/site-control/masterSchema'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { commitMasterRelease, exportMasterBundle, readMasterRelease } from '../../src/site-control/masterPublisher'
import { masterDigest, masterReference, projectMasterData, snapshotJSON, type MasterBundle, type MasterSnapshot } from '../../src/site-control/masterSnapshot'
import { receiveMasterRelease } from '../../src/site-runtime/masterReceiver'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
let central: D1Database, a: D1Database, b: D1Database
const stamp = '2026-09-17T04:00:00.000Z'
const snapshot = (recordId: string, patch: Partial<MasterSnapshot> = {}): MasterSnapshot => ({ format: 1,
  collection: 'affiliate-networks', recordId, revision: 1, tenantId: 1, sourceUpdatedAt: stamp,
  data: projectMasterData('affiliate-networks',{ name: 'Shared network', slug: 'network', status: 'active' }), relations: {}, ...patch })
const context = (siteId = 'a'): SiteContext => ({ siteId, localSiteId: siteId === 'a' ? 37 : 82, binding: siteId === 'a' ? a : b,
  routingVersion: 1, currentRoutingVersion: () => 1, identity: null, requestHost: `cms-site-${siteId}.beginos.org` })
const deliver = (bundle: MasterBundle, siteId = 'a') => withSiteContext(context(siteId),
  () => receiveMasterRelease(bundle.root,{ readBundle: async () => bundle }))

describe('versioned master publishing and candidate receipt on native D1', () => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { CENTRAL: 'masters-central', A: 'masters-a', B: 'masters-b' } })
    ;[central,a,b] = await Promise.all(['CENTRAL','A','B'].map(name => mf.getD1Database(name)))
    await central.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
    await central.exec('CREATE TABLE sites (id INTEGER PRIMARY KEY,runtime_site_id TEXT UNIQUE,tenant_id INTEGER)')
    await central.exec("INSERT INTO sites VALUES (101,'a',1),(102,'b',2)")
    await migrateSiteControl(central)
    await migrateCentralMasters(central)
    await migrateCentralMasters(central)
    for (const [siteId,localSiteId,tenantId,database] of [['a',37,11,a],['b',82,22,b]] as const) {
      await registerSite(central,{ siteId,localSiteId,databaseId: `${localSiteId.toString().padStart(8,'0')}-1111-4111-8111-111111111111`,
        bindingName: `SITE_D1_${siteId.toUpperCase()}`,workerGroup: 'group-1',adminHost: `cms-site-${siteId}.beginos.org`,
        schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `provision-${siteId}` })
      await database.exec('CREATE TABLE tenants (id INTEGER PRIMARY KEY,central_source_record_id TEXT)')
      await database.exec('CREATE TABLE sites (id INTEGER PRIMARY KEY,tenant_id INTEGER,pipeline_profile_id INTEGER)')
      await database.prepare('INSERT INTO tenants VALUES (?,?)').bind(tenantId,siteId === 'a' ? '1' : '2').run()
      await database.prepare('INSERT INTO sites VALUES (?,?,99)').bind(localSiteId,tenantId).run()
      await database.exec('CREATE TABLE articles (id INTEGER PRIMARY KEY,slug TEXT,body TEXT,status TEXT)')
      await database.exec("INSERT INTO articles VALUES (5,'reviewed-url','employee-approved text','published')")
      await database.exec('CREATE TABLE offers (id INTEGER PRIMARY KEY,categories TEXT,featured_on_home TEXT,slug TEXT)')
      await database.exec("INSERT INTO offers VALUES (5,'[8]','[37]','retained-offer-url')")
      await migrateSiteMasters(database)
      await migrateSiteMasters(database)
    }
  },30000)
  afterAll(async () => { await mf?.dispose() })

  it('atomically publishes exact concurrent retries once and rejects competing revisions, operations and tenant moves', async () => {
    const input = snapshot('1')
    const releases = await Promise.all(Array.from({ length: 12 },() => commitMasterRelease(central,input,'publish-network-1')))
    expect(new Set(releases.map(r => r.digest)).size).toBe(1)
    expect(await central.prepare("SELECT COUNT(*) FROM central_master_releases WHERE record_id='1'").first('COUNT(*)')).toBe(1)
    await expect(commitMasterRelease(central,{ ...input,data: { ...input.data,name: 'Conflict' } },'publish-network-1')).rejects.toThrow('conflict')
    await expect(commitMasterRelease(central,input,'another-operation')).rejects.toThrow('conflict')
    await expect(commitMasterRelease(central,{ ...input,revision: 3 },'revision-gap')).rejects.toThrow('conflict')
    await expect(commitMasterRelease(central,{ ...input,revision: 2,tenantId: 2 },'tenant-move')).rejects.toThrow('conflict')
    await expect(central.prepare("UPDATE central_master_releases SET tenant_id=2 WHERE record_id='1'").run()).rejects.toThrow('immutable')
    await expect(central.prepare("DELETE FROM central_master_releases WHERE record_id='1'").run()).rejects.toThrow('immutable')
    const contenders = await Promise.allSettled(['left','right'].map(name => commitMasterRelease(central,
      { ...input,revision: 2,data: { ...input.data,name } },`revision-two-${name}`)))
    expect(contenders.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(contenders.filter(result => result.status === 'rejected')).toHaveLength(1)
  },30000)

  it('pins dependency versions and isolates tenant delivery despite differing central and local numeric IDs', async () => {
    const network = await commitMasterRelease(central,snapshot('2'),'network-2')
    const offer = await commitMasterRelease(central,snapshot('3',{ collection: 'offers',
      data: projectMasterData('offers',{ title: 'Product',slug: 'product',status: 'active',categories: [123],reviewDraft: { mdx: 'Do not export' },
        amazon: { asin: 'fixture',merchantRaw: { secret: 'not exported' },dfsSnapshot: { secret: 'not exported' } } }),
      relations: { network: masterReference(network) } }),'offer-3')
    const bundle = await exportMasterBundle(central,'a',1,masterReference(offer))
    expect(bundle).toMatchObject({ siteId: 'a',localSiteId: 37,centralTenantId: 1 })
    expect(bundle.releases.map(r => r.collection)).toEqual(['affiliate-networks','offers'])
    expect(JSON.stringify(bundle)).not.toContain('not exported')
    expect(offer.data).not.toHaveProperty('categories')
    await expect(exportMasterBundle(central,'b',1,masterReference(offer))).rejects.toThrow('Cross-tenant')
    await expect(exportMasterBundle(central,'a',2,masterReference(offer))).rejects.toThrow('routing')
    await deliver(bundle)
    await expect(deliver(bundle,'b')).rejects.toThrow('destination')
    expect(await b.prepare('SELECT COUNT(*) AS n FROM site_master_releases').first('n')).toBe(0)
    const other = await commitMasterRelease(central,snapshot('4',{ tenantId: 2 }),'network-other-tenant')
    await expect(commitMasterRelease(central,{ ...offer,recordId: '5',relations: { network: masterReference(other) } },'cross-dependency')).rejects.toThrow('Cross-tenant')
    await expect(commitMasterRelease(central,{ ...offer,recordId: '5',relations: { network: { ...masterReference(network),digest: '0'.repeat(64) } } },'missing-dependency')).rejects.toThrow('unavailable')
  })

  it('receives duplicates and late versions without changing active configuration, approved content, placement or URLs', async () => {
    const v1 = await commitMasterRelease(central,snapshot('6'),'network-6-v1')
    const v2 = await commitMasterRelease(central,snapshot('6',{ revision: 2,data: { ...v1.data,name: 'Revision two' } }),'network-6-v2')
    const first = await exportMasterBundle(central,'a',1,masterReference(v1)), second = await exportMasterBundle(central,'a',1,masterReference(v2))
    await Promise.all(Array.from({ length: 8 },() => deliver(second)))
    await deliver(first)
    expect(await a.prepare("SELECT revision FROM site_master_heads WHERE record_id='6'").first('revision')).toBe(2)
    expect(await a.prepare("SELECT COUNT(*) AS n FROM site_master_releases WHERE record_id='6'").first('n')).toBe(2)
    expect(await a.prepare('SELECT * FROM articles WHERE id=5').first()).toEqual({ id: 5,slug: 'reviewed-url',body: 'employee-approved text',status: 'published' })
    expect(await a.prepare('SELECT * FROM offers WHERE id=5').first()).toEqual({ id: 5,categories: '[8]',featured_on_home: '[37]',slug: 'retained-offer-url' })
    expect(await a.prepare('SELECT pipeline_profile_id FROM sites WHERE id=37').first('pipeline_profile_id')).toBe(99)
    expect((await readMasterRelease(central,masterReference(v1))).data.name).toBe('Shared network')
  },30000)

  it('rejects changed bytes, missing/extra dependencies and forged destination or source tenant mappings', async () => {
    const release = await commitMasterRelease(central,snapshot('7'),'network-7')
    const bundle = await exportMasterBundle(central,'a',1,masterReference(release))
    await expect(deliver({ ...bundle,releases: [{ ...release,data: { ...release.data,name: 'Tampered' } }] })).rejects.toThrow('integrity')
    await expect(deliver({ ...bundle,localSiteId: 101 })).rejects.toThrow('destination')
    await expect(deliver({ ...bundle,centralTenantId: 2 })).rejects.toThrow('Cross-tenant')
    await expect(deliver({ ...bundle,root: { ...bundle.root,digest: '0'.repeat(64) } })).rejects.toThrow('dependency')
    const extra = await commitMasterRelease(central,snapshot('8'),'network-8')
    await expect(deliver({ ...bundle,releases: [...bundle.releases,extra] })).rejects.toThrow('Unrequested')
    await a.prepare("UPDATE tenants SET central_source_record_id='2' WHERE id=11").run()
    try { await expect(deliver(bundle)).rejects.toThrow('mapping'); } finally {
      await a.prepare("UPDATE tenants SET central_source_record_id='1' WHERE id=11").run()
    }
    expect(await a.prepare("SELECT COUNT(*) AS n FROM site_master_releases WHERE record_id='7'").first('n')).toBe(0)
  })

  it('rolls back the complete candidate bundle when a later insert fails and rejects conflicting existing revisions', async () => {
    const network = await commitMasterRelease(central,snapshot('9'),'network-9')
    const offer = await commitMasterRelease(central,snapshot('10',{ collection: 'offers',data: projectMasterData('offers',{ title: 'Ten' }),
      relations: { network: masterReference(network) } }),'offer-10')
    const bundle = await exportMasterBundle(central,'a',1,masterReference(offer))
    await a.exec("CREATE TRIGGER fail_master BEFORE INSERT ON site_master_releases WHEN NEW.collection='offers' AND NEW.record_id='10' BEGIN SELECT RAISE(ABORT,'injected failure'); END")
    await expect(deliver(bundle)).rejects.toThrow('injected')
    expect(await a.prepare("SELECT COUNT(*) AS n FROM site_master_releases WHERE record_id IN ('9','10')").first('n')).toBe(0)
    expect(await a.prepare("SELECT COUNT(*) AS n FROM site_master_heads WHERE record_id IN ('9','10')").first('n')).toBe(0)
    await a.exec('DROP TRIGGER fail_master')
    await deliver(bundle)
    const changed = { ...offer,data: { ...offer.data,title: 'Conflicting authenticated release' } }
    const digest = await masterDigest(snapshotJSON(changed))
    await expect(deliver({ ...bundle,root: { ...bundle.root,digest },releases: [network,{ ...changed,digest }] })).rejects.toThrow('Conflicting')
    expect(await a.prepare("SELECT digest FROM site_master_releases WHERE collection='offers' AND record_id='10'").first('digest')).toBe(offer.digest)
  })

  it('fails closed when routing is revoked during RPC and never accepts unqualified local references', async () => {
    const release = await commitMasterRelease(central,snapshot('11'),'network-11')
    const bundle = await exportMasterBundle(central,'a',1,masterReference(release))
    let version = 1
    await withSiteContext({ ...context(),currentRoutingVersion: () => version },async () => {
      await expect(receiveMasterRelease(bundle.root,{ readBundle: async () => { version = 2; return bundle } })).rejects.toThrow('Stale site routing')
    })
    expect(await a.prepare("SELECT COUNT(*) AS n FROM site_master_releases WHERE record_id='11'").first('n')).toBe(0)
    const preset = projectMasterData('keyword-batch-presets',{ name: 'Quick wins',pillarKeywordId: 5,site: 37 })
    expect(preset).not.toHaveProperty('pillarKeywordId')
    expect(preset).not.toHaveProperty('site')
    expect(projectMasterData('pipeline-profiles',{ name: 'Profile',isDefault: true })).not.toHaveProperty('isDefault')
    expect(() => projectMasterData('authors',{ displayName: 'Author',headshot: 1 })).toThrow('asset export')
    expect(() => projectMasterData('authors',{ bioLexical: { root: { children: [{ type: 'relationship',relationTo: 'articles',value: 5 }] } } })).toThrow('relationships')
    expect(() => snapshotJSON(snapshot('12',{ data: { ...release.data,site: 37 } }))).toThrow('allowlist')
    expect(() => projectMasterData('pipeline-profiles',{ articleStrategy: { foo: Infinity } })).toThrow('finite JSON')
  })

  it('allows only the explicit global layout catalog across tenants, with no implicit global company records', async () => {
    const layout = await commitMasterRelease(central,snapshot('13',{ collection: 'site-layouts',tenantId: 0,
      data: projectMasterData('site-layouts',{ layoutKey: 'template1',name: 'Shared layout' }) }),'global-layout')
    for (const siteId of ['a','b']) await deliver(await exportMasterBundle(central,siteId,1,masterReference(layout)),siteId)
    for (const database of [a,b]) expect(await database.prepare("SELECT tenant_id FROM site_master_releases WHERE collection='site-layouts' AND record_id='13'").first('tenant_id')).toBe(0)
    await expect(commitMasterRelease(central,snapshot('14',{ tenantId: 0 }),'forged-global-network')).rejects.toThrow('identity')
    await expect(commitMasterRelease(central,{ ...layout,recordId: '15',tenantId: 1 },'forged-tenant-layout')).rejects.toThrow('identity')
  })
})
