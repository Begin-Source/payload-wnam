// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { createCentralPayloadConfig } from '../../src/site-control/config'
import { createSitePayloadConfig } from '../../src/site-runtime/config'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'
import { migrateCentralConfigs, migrateSiteConfigs } from '../../src/site-control/configSchema'
import { commitConfigRelease, exportConfigBundle, publishConfigFromPayload } from '../../src/site-control/configPublisher'
import { configReference, configSnapshotJSON, projectConfigData, type ConfigBundle, type ConfigKind, type ConfigRelease } from '../../src/site-control/configSnapshot'
import { receiveConfigRelease } from '../../src/site-runtime/configReceiver'
import { reviewSiteConfig, selectSiteConfig } from '../../src/site-runtime/configSelection'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { masterDigest } from '../../src/site-control/masterSnapshot'

vi.mock('../../src/payload.config',() => { throw new Error('Shared Payload config imported') })
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let central: Payload,site: Payload,db: D1Database,contexts: SiteContext[]
let admin: NonNullable<PayloadRequest['user']>,gm: NonNullable<PayloadRequest['user']>
const external = vi.fn(async () => { throw new Error('External capability unexpectedly invoked') })
const at = '2026-09-17T06:00:00.000Z'
async function schema(payload: Payload,db: D1Database) {
  const adapter = payload.db as unknown as { schema: unknown;defaultDrizzleSnapshot: unknown;requireDrizzleKit: () => {
    generateDrizzleJson: (schema: unknown) => unknown;generateMigration: (before: unknown,after: unknown) => Promise<string[]> } }
  const kit = adapter.requireDrizzleKit(),sql = await kit.generateMigration(adapter.defaultDrizzleSnapshot,await kit.generateDrizzleJson(adapter.schema))
  for (let offset=0;offset<sql.length;offset+=25) await db.batch(sql.slice(offset,offset+25).map(sql => db.prepare(sql)))
}
const req = (role = 'manager',siteId = 'a') => createLocalReq({ user: { id: 1,centralUserId: '7',displayName: 'Manager',collection: 'users',
  _strategy: 'central-site-session',siteId,siteRole: role } as never },site)
async function publishGlobal(kind: Exclude<ConfigKind,'site-quotas'>,data: Record<string,unknown>,revision: number,operationId: string) {
  const value = await central.updateGlobal({ slug: kind,user: admin,data: data as never })
  return publishConfigFromPayload(db,await createLocalReq({ user: admin },central),{
    kind,sourceRecordId: String(value.id),expectedRevision: revision-1,expectedUpdatedAt: value.updatedAt!,operationId })
}
async function candidate(release: ConfigRelease,index=0) {
  const bundle = await exportConfigBundle(db,contexts[index].siteId,1,configReference(release))
  await withSiteContext(contexts[index],() => receiveConfigRelease(configReference(release),{ readConfig: async () => bundle }))
  return bundle
}
async function select(release: ConfigRelease,operationId: string) {
  const request = await req(),review = await reviewSiteConfig(request,release.kind)
  await selectSiteConfig(request,configReference(release),review.expected,operationId)
  return { request,review }
}
describe('versioned Globals and site quota policies with full Payload and native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default {fetch(){return new Response("fixture")}}',compatibilityDate: '2025-08-15',
      d1Databases: { CENTRAL: 'config-central',A: 'config-a',B: 'config-b' },r2Buckets: { CENTRAL: 'config-central',PUBLIC: 'config-public',PRIVATE: 'config-private' } })
    db = await mf.getD1Database('CENTRAL')
    central = await getPayload({ key: 'config-sync-central',config: await createCentralPayloadConfig({ database: db,bucket: await mf.getR2Bucket('CENTRAL'),
      secret: 'isolated-config-central',generationModels: [],authorizeAiGeneration: external }) })
    site = await getPayload({ key: 'config-sync-site',config: await createSitePayloadConfig({ secret: 'isolated-config-site',identity: { authenticate: external,redeem: external,logout: external },
      publicBucket: await mf.getR2Bucket('PUBLIC'),privateBucket: await mf.getR2Bucket('PRIVATE'),generationModels: [],authorizeAiGeneration: external,executeExternalTask: external }) })
    await schema(central,db); await migrateSiteControl(db); await migrateCentralConfigs(db); await migrateCentralConfigs(db)
    const bootstrap = { id: 7,collection: 'users',email: 'admin@example.invalid',roles: ['super-admin'] } as typeof admin
    for (const id of [1,2]) await central.create({ collection: 'tenants',data: { id,name: `Tenant ${id}`,slug: `tenant-${id}`,domain: `tenant-${id}.example.invalid` } })
    admin = { ...await central.create({ collection: 'users',user: bootstrap,data: { id: 7,email: 'admin@example.invalid',password: 'config-test-only-password',
      roles: ['super-admin'],tenants: [{ tenant: 1 },{ tenant: 2 }] } }),collection: 'users' }
    gm = { ...await central.create({ collection: 'users',user: admin,data: { id: 8,email: 'gm@example.invalid',password: 'config-test-only-password',roles: ['general-manager'],tenants: [{ tenant: 1 }] } }),collection: 'users' }
    contexts = []
    for (const [name,centralId,localSiteId,localTenantId,centralTenant] of [['A',101,37,11,1],['B',102,82,22,2]] as const) {
      const binding = await mf.getD1Database(name),siteId = name.toLowerCase()
      await schema(site,binding); await migrateSiteConfigs(binding); await migrateSiteConfigs(binding)
      await registerSite(db,{ siteId,localSiteId,databaseId: `${centralId.toString().padStart(8,'0')}-1111-4111-8111-111111111111`,bindingName: `SITE_D1_${name}`,
        workerGroup: 'group-1',adminHost: `cms-site-${siteId}.beginos.org`,schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `register-${siteId}` })
      await central.create({ collection: 'sites',user: admin,data: { id: centralId,name: siteId,tenant: centralTenant,runtimeSiteId: siteId,primaryDomain: `${siteId}.example.invalid`,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
      const context: SiteContext = { siteId,localSiteId,binding,routingVersion: 1,currentRoutingVersion: () => 1,identity: null,requestHost: `cms-site-${siteId}.beginos.org` }
      contexts.push(context)
      await withSiteContext(context,async () => {
        await syncSiteIdentityProjection({ siteId,localSiteId,userId: '7',displayName: 'Manager',role: 'manager',routingVersion: 1 })
        await site.create({ collection: 'tenants',data: { id: localTenantId,name: 'Tenant',slug: 'tenant',centralSource: { recordId: String(centralTenant),revision: 1,syncedAt: at } } as never })
        await site.create({ collection: 'sites',data: { id: localSiteId,name: siteId,slug: siteId,tenant: localTenantId,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
      })
    }
  },120000)
  afterAll(async () => { await mf?.dispose() })

  it('publishes and applies four actual Globals only after review, with native array rows and no source array IDs or provider notes',async () => {
    const releases = [
      await publishGlobal('llm-prompts',{ defaultModel: 'test/model',temperature: 0.3,globalSystemPrompt: 'Reviewed instructions',apiNotes: 'DO NOT COPY ROUTING NOTES' },1,'llm-v1'),
      await publishGlobal('prompt-library',{ entries: [{ name: 'Money page',body: 'Review buying intent evidence' }],skillOverrides: { editorial: 'Sources first' } },1,'library-v1'),
      await publishGlobal('pipeline-settings',{ defaultLocale: 'en',sectionParallelism: 2,articleStrategy: { targetWords: 1600 },tavilyEnabled: false },1,'pipeline-v1'),
      await publishGlobal('quota-rules',{ rules: { maxSitesPerTenant: 50 },notes: 'Not an execution field' },1,'rules-v1'),
    ]
    for (const release of releases) {
      expect(JSON.stringify(release)).not.toContain('DO NOT COPY')
      await candidate(release)
      await withSiteContext(contexts[0],async () => {
        const request = await req(),review = await reviewSiteConfig(request,release.kind)
        expect(review.data).toBeNull()
        await expect(selectSiteConfig(await req('editor'),configReference(release),review.expected,'editor')).rejects.toThrow('manager')
        await selectSiteConfig(request,configReference(release),review.expected,`apply-${release.kind}`)
        const read = await site.findGlobal({ slug: release.kind as Exclude<ConfigKind,'site-quotas'>,req: request,depth: 0,overrideAccess: false })
        expect(projectConfigData(release.kind,read as unknown as Record<string,unknown>)).toEqual(release.data)
        expect((read as unknown as { centralSource: { revision: number } }).centralSource.revision).toBe(1)
      })
    }
    const original = await central.findGlobal({ slug: 'prompt-library' })
    await withSiteContext(contexts[0],async () => {
      const local = await site.findGlobal({ slug: 'prompt-library' })
      expect(local.entries?.[0].id).not.toBe(original.entries?.[0].id)
      expect((await site.findGlobal({ slug: 'llm-prompts' })).apiNotes).toBeNull()
    })
    expect(await contexts[1].binding.prepare('SELECT COUNT(*) AS n FROM site_config_releases').first('n')).toBe(0)
    expect(external).not.toHaveBeenCalled()
  },30000)

  it('binds quota policy to the registered stable site and tenant and preserves existing local ID, usage and notes',async () => {
    const policy = await central.create({ collection: 'site-quotas',user: admin,data: { id: 6000,name: 'Daily ten',site: 101,tenant: 1,dailyPostCap: 10,
      maxPublishedPages: 500,maxMonthlyAiRuns: 500,monthlyTokenBudgetUsd: 55,monthlyImagesBudgetUsd: 25,monthlyDfsCreditBudget: 3 } as never })
    const release = await publishConfigFromPayload(db,await createLocalReq({ user: gm },central),{ kind: 'site-quotas',sourceRecordId: '6000',expectedRevision: 0,expectedUpdatedAt: policy.updatedAt,operationId: 'quota-v1' })
    expect(release.siteId).toBe('a'); expect(release.data).not.toHaveProperty('usageYtd')
    await expect(exportConfigBundle(db,'b',1,configReference(release))).rejects.toThrow('Cross-site')
    await candidate(release)
    await withSiteContext(contexts[0],async () => {
      await site.create({ collection: 'site-quotas',data: { id: 9,name: 'Local policy',site: 37,tenant: 11,usageYtd: { openrouterUsd: 12.5 },notes: 'Keep local note' } as never })
      const request = await req(),review = await reviewSiteConfig(request,'site-quotas')
      await contexts[0].binding.prepare('UPDATE site_quotas SET usage_ytd=? WHERE id=9').bind(JSON.stringify({ openrouterUsd: 13 })).run()
      await selectSiteConfig(request,configReference(release),review.expected,'apply-quota')
      expect(await site.findByID({ collection: 'site-quotas',id: 9,depth: 0 })).toMatchObject({ site: 37,tenant: 11,dailyPostCap: 10,usageYtd: { openrouterUsd: 13 },notes: 'Keep local note' })
      await expect(site.update({ collection: 'site-quotas',id: 9,req: request,overrideAccess: false,data: { dailyPostCap: 999 } })).rejects.toThrow()
    })
  },30000)

  it('detects same-timestamp edits and serializes competing selections; completed retries never restore a superseded version',async () => {
    const left = await publishGlobal('llm-prompts',{ globalSystemPrompt: 'Left' },2,'llm-v2')
    const right = await publishGlobal('llm-prompts',{ globalSystemPrompt: 'Right' },3,'llm-v3')
    await candidate(left); await candidate(right)
    await withSiteContext(contexts[0],async () => {
      const request = await req(),review = await reviewSiteConfig(request,'llm-prompts')
      await contexts[0].binding.exec("UPDATE llm_prompts SET global_system_prompt='Employee edit'")
      await expect(selectSiteConfig(request,configReference(left),review.expected,'stale-global')).rejects.toThrow('changed')
      const fresh = await reviewSiteConfig(request,'llm-prompts')
      const choices = [left,right]
      const results = await Promise.allSettled(choices.map((release,i) => selectSiteConfig(request,configReference(release),fresh.expected,`compete-${i}`)))
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      const winner = results.findIndex(result => result.status === 'fulfilled'),other = 1-winner
      await select(choices[other],'later-choice')
      await selectSiteConfig(request,configReference(choices[winner]),fresh.expected,`compete-${winner}`)
      expect((await site.findGlobal({ slug: 'llm-prompts' })).globalSystemPrompt).toBe(choices[other].data.globalSystemPrompt)
      await expect(selectSiteConfig(request,configReference(choices[other]),fresh.expected,`compete-${winner}`)).rejects.toThrow('conflict')
    })
  },30000)

  it('detects child-only prompt edits and rolls back the whole Global, array and receipt on a later child insert failure',async () => {
    const release = await publishGlobal('prompt-library',{ entries: [{ name: 'First',body: 'First body' },{ name: 'Second',body: 'Second body' }] },2,'library-v2')
    await candidate(release)
    await withSiteContext(contexts[0],async () => {
      const request = await req(),old = await reviewSiteConfig(request,'prompt-library'),binding = contexts[0].binding
      await binding.exec("UPDATE prompt_library_entries SET body='Local child edit'")
      await expect(selectSiteConfig(request,configReference(release),old.expected,'stale-child')).rejects.toThrow('changed')
      const review = await reviewSiteConfig(request,'prompt-library'),before = await site.findGlobal({ slug: 'prompt-library' })
      await binding.exec("CREATE TRIGGER fail_config_child BEFORE INSERT ON prompt_library_entries WHEN NEW.name='Second' BEGIN SELECT RAISE(ABORT,'injected child failure'); END")
      await expect(selectSiteConfig(request,configReference(release),review.expected,'rollback-array')).rejects.toThrow('injected')
      expect(await site.findGlobal({ slug: 'prompt-library' })).toEqual(before)
      expect(await binding.prepare("SELECT COUNT(*) AS n FROM site_config_operations WHERE operation_id='rollback-array'").first('n')).toBe(0)
      await binding.exec('DROP TRIGGER fail_config_child')
      await selectSiteConfig(request,configReference(release),review.expected,'rollback-array')
      expect((await site.findGlobal({ slug: 'prompt-library' })).entries?.map(entry => entry.name)).toEqual(['First','Second'])
    })
  },30000)

  it('rejects invalid configuration fields, credentials and tampered releases without creating receipts',async () => {
    expect(() => projectConfigData('pipeline-settings',{ articleStrategy: { apiKey: 'do-not-send' } })).toThrow('Credentials')
    expect(() => projectConfigData('site-quotas',{ name: 'Invalid',dailyPostCap: -1 })).toThrow('nonnegative')
    const release = await publishGlobal('llm-prompts',{ globalSystemPrompt: 'Integrity' },4,'llm-v4')
    const bundle = await exportConfigBundle(db,'a',1,configReference(release))
    await withSiteContext(contexts[0],async () => {
      await expect(receiveConfigRelease(configReference(release),{ readConfig: async () => ({ ...bundle,release: { ...release,data: { ...release.data,globalSystemPrompt: 'Tampered' } } }) })).rejects.toThrow('integrity')
      await expect(receiveConfigRelease(configReference(release),{ readConfig: async () => ({ ...bundle,localSiteId: 101 }) })).rejects.toThrow('destination')
    })
    const bad = { ...release,revision: 5,data: { ...release.data,temperature: 'bad' } }
    const invalid = await commitConfigRelease(db,bad,'invalid-field-fixture')
    await candidate(invalid)
    await withSiteContext(contexts[0],async () => {
      await expect(select(invalid,'invalid-field')).rejects.toThrow()
      expect(await contexts[0].binding.prepare("SELECT COUNT(*) AS n FROM site_config_operations WHERE operation_id='invalid-field'").first('n')).toBe(0)
    })
  },30000)

  it('enforces the SQL review fence when a child changes immediately before batch commit and supports a separate tenant policy',async () => {
    const release = await publishGlobal('prompt-library',{ entries: [{ name: 'Third',body: 'Third body' }] },3,'library-v3')
    await candidate(release)
    const binding = contexts[0].binding
    let inject = true
    const raced = new Proxy(binding,{ get(target,key) {
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        if (inject) { inject=false; await binding.exec("UPDATE prompt_library_entries SET body='Edited at commit'") }
        return binding.batch(statements)
      }
      const value = Reflect.get(target,key)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    await withSiteContext({ ...contexts[0],binding: raced },async () => {
      const request = await req(),review = await reviewSiteConfig(request,'prompt-library')
      await expect(selectSiteConfig(request,configReference(release),review.expected,'commit-race')).rejects.toThrow('changed')
      expect((await site.findGlobal({ slug: 'prompt-library' })).entries?.every(entry => entry.body === 'Edited at commit')).toBe(true)
      expect(await binding.prepare("SELECT COUNT(*) AS n FROM site_config_operations WHERE operation_id='commit-race'").first('n')).toBe(0)
    })
    const foreign = await central.create({ collection: 'site-quotas',user: admin,data: { id: 6001,name: 'Site B',site: 102,tenant: 2,dailyPostCap: 10 } as never })
    const input = { kind: 'site-quotas' as const,sourceRecordId: '6001',expectedRevision: 0,expectedUpdatedAt: foreign.updatedAt,operationId: 'quota-b-v1' }
    await expect(publishConfigFromPayload(db,await createLocalReq({ user: gm },central),input)).rejects.toThrow()
    const quota = await publishConfigFromPayload(db,await createLocalReq({ user: admin },central),input)
    await candidate(quota,1)
    await withSiteContext(contexts[1],async () => {
      const request = await req('manager','b'),review = await reviewSiteConfig(request,'site-quotas')
      expect(review.data).toBeNull()
      await selectSiteConfig(request,configReference(quota),review.expected,'apply-quota-b')
      const result = await site.find({ collection: 'site-quotas',depth: 0,req: request,overrideAccess: false })
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0]).toMatchObject({ site: 82,tenant: 22,dailyPostCap: 10 })
      expect(result.docs[0].id).not.toBe(6001)
    })
  },30000)

  it('rechecks central source access on retries and protects tenant/site mappings, routing and immutable revisions',async () => {
    const source = await central.findGlobal({ slug: 'quota-rules' })
    const input = { kind: 'quota-rules' as const,sourceRecordId: String(source.id),expectedRevision: 1,expectedUpdatedAt: source.updatedAt!,operationId: 'denied-global' }
    await expect(publishConfigFromPayload(db,await createLocalReq({ user: gm },central),input)).rejects.toThrow('permission')
    await expect(publishConfigFromPayload(db,await createLocalReq({ user: admin },central),{ ...input,expectedUpdatedAt: at })).rejects.toThrow('changed')
    const release = await publishGlobal('quota-rules',{ rules: { maxSitesPerTenant: 25 } },2,'rules-v2')
    const retries = await Promise.all(Array.from({ length: 6 },() => commitConfigRelease(db,release,'rules-v2')))
    expect(new Set(retries.map(release => release.digest)).size).toBe(1)
    await expect(commitConfigRelease(db,{ ...release,data: { rules: { maxSitesPerTenant: 10 } } },'rules-v2')).rejects.toThrow()
    await expect(db.exec("UPDATE central_config_releases SET tenant_id=2")).rejects.toThrow('immutable')
    const bundle = await exportConfigBundle(db,'a',1,configReference(release))
    let version = 1
    await withSiteContext({ ...contexts[0],currentRoutingVersion: () => version },async () => {
      await expect(receiveConfigRelease(configReference(release),{ readConfig: async () => { version=2; return bundle } })).rejects.toThrow('Stale')
    })
    await withSiteContext(contexts[0],async () => {
      await contexts[0].binding.exec("UPDATE tenants SET central_source_record_id='2' WHERE id=11")
      try { await expect(receiveConfigRelease(configReference(release),{ readConfig: async () => bundle })).rejects.toThrow('mapping') }
      finally { await contexts[0].binding.exec("UPDATE tenants SET central_source_record_id='1' WHERE id=11") }
    })
    const forged = { ...bundle,release: { ...release,data: { rules: {},unknown: true } } } as ConfigBundle
    forged.release.digest = await masterDigest(JSON.stringify(forged.release.data))
    expect(() => configSnapshotJSON(forged.release)).toThrow('fields')
    await expect(exportConfigBundle(db,'a',2,configReference(release))).rejects.toThrow('routing')
  },30000)
})
