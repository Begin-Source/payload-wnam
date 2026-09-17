// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { createSitePayloadConfig } from '../../src/site-runtime/config'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { migrateSiteMasters } from '../../src/site-control/masterSchema'
import { migrateSiteMasterCopies } from '../../src/site-runtime/masterCopySchema'
import { masterDigest, masterReference, projectMasterData, snapshotJSON, type MasterCollection, type MasterRelease, type MasterSnapshot } from '../../src/site-control/masterSnapshot'
import { receiveMasterRelease } from '../../src/site-runtime/masterReceiver'
import { applyMasterRelease } from '../../src/site-runtime/masterCopies'
import { selectMasterPrompt } from '../../src/site-runtime/masterSelection'
import { loadTenantPromptTemplateBody } from '../../src/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import { resolveAudienceStepPrompts } from '../../src/utilities/domainGeneration/resolveDomainGenPrompts'
import { resolveCategorySlotsShortnamePrompts } from '../../src/utilities/categorySlotsGeneration/resolveCategorySlotsPrompts'
import { resolveTrustPagesBundlePrompts } from '../../src/utilities/sitePagesBundleContent/resolveTrustPagesBundlePrompts'

vi.mock('../../src/payload.config',() => { throw new Error('Shared config imported') })
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let payload: Payload, contexts: SiteContext[]
const external = vi.fn(async () => { throw new Error('Unexpected external call') })
const stamp = '2026-09-17T04:00:00.000Z'
async function release(collection: MasterCollection, recordId: string, data: Record<string,unknown>, relations: MasterSnapshot['relations'] = {}, revision = 1): Promise<MasterRelease> {
  const snapshot: MasterSnapshot = { format: 1,collection,recordId,revision,tenantId: collection === 'site-layouts' ? 0 : 1,
    sourceUpdatedAt: stamp,data: projectMasterData(collection,data),relations }
  return { ...snapshot,digest: await masterDigest(snapshotJSON(snapshot)),operationId: `${collection}-${recordId}-${revision}`,createdAt: stamp }
}
async function request(role = 'manager',siteId = 'a'): Promise<PayloadRequest> {
  return createLocalReq({ user: { id: 1,centralUserId: '7',displayName: 'Manager',collection: 'users',_strategy: 'central-site-session',
    siteId,siteRole: role } as never },payload)
}
async function receive(root: MasterRelease, dependencies: MasterRelease[] = []) {
  await receiveMasterRelease(masterReference(root),{ readBundle: async () => ({ siteId: 'a',localSiteId: 37,routingVersion: 1,
    centralTenantId: 1,root: masterReference(root),releases: [...dependencies,root] }) })
}
const profileData = { name: 'Buying intent · 发布质量 80+',slug: 'quality',defaultLocale: 'en',sectionParallelism: 2,
  tavilyEnabled: false,articleStrategy: { targetWords: 1600 },isDefault: true }

describe('atomic master copies and explicit prompt selection with full Payload/native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("fixture") } }',compatibilityDate: '2025-08-15',
      d1Databases: { A: 'copies-a',B: 'copies-b' },r2Buckets: { PUBLIC: 'copies-public',PRIVATE: 'copies-private' } })
    const config = await createSitePayloadConfig({ secret: 'master-copy-test-only',identity: { authenticate: external,redeem: external,logout: external },
      publicBucket: await mf.getR2Bucket('PUBLIC'),privateBucket: await mf.getR2Bucket('PRIVATE'),generationModels: [],authorizeAiGeneration: external,executeExternalTask: external })
    payload = await getPayload({ config,key: 'master-copy-config' })
    const adapter = payload.db as unknown as { schema: unknown;defaultDrizzleSnapshot: unknown;requireDrizzleKit: () => {
      generateDrizzleJson: (schema: unknown) => unknown;generateMigration: (before: unknown,after: unknown) => Promise<string[]> } }
    const kit = adapter.requireDrizzleKit(), sql = await kit.generateMigration(adapter.defaultDrizzleSnapshot,await kit.generateDrizzleJson(adapter.schema))
    contexts = []
    for (const [name,localSiteId,localTenantId] of [['A',37,11],['B',82,22]] as const) {
      const binding = await mf.getD1Database(name)
      for (let offset = 0;offset < sql.length;offset += 25) await binding.batch(sql.slice(offset,offset + 25).map(statement => binding.prepare(statement)))
      await migrateSiteMasters(binding); await migrateSiteMasterCopies(binding); await migrateSiteMasterCopies(binding)
      const context: SiteContext = { siteId: name.toLowerCase(),localSiteId,binding,routingVersion: 1,currentRoutingVersion: () => 1,
        identity: null,requestHost: `cms-site-${name.toLowerCase()}.beginos.org` }
      contexts.push(context)
      await withSiteContext(context,async () => {
        await syncSiteIdentityProjection({ siteId: context.siteId,localSiteId,userId: '7',displayName: 'Manager',role: 'manager',routingVersion: 1 })
        await payload.create({ collection: 'tenants',data: { id: localTenantId,name: 'Projection',slug: 'projection',
          centralSource: { recordId: '1',revision: 1,syncedAt: stamp } } as never })
        await payload.create({ collection: 'sites',data: { id: localSiteId,name: 'Copy site',slug: context.siteId,tenant: localTenantId,
          publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
      })
    }
  },60000)
  afterAll(async () => { await mf?.dispose() })

  it('materializes all eight collection types with Payload field validation, driver types and pinned local dependencies',async () => {
    await withSiteContext(contexts[0],async () => {
      const req = await request()
      const network = await release('affiliate-networks','101',{ name: 'Network',slug: 'network',status: 'active' })
      const offer = await release('offers','102',{ title: 'Product',slug: 'product',status: 'active',amazon: { asin: 'FIXTURE',priceCents: 2499,currency: 'USD',primeEligible: true } },{ network: masterReference(network) })
      await receive(offer,[network])
      const result = await applyMasterRelease(req,masterReference(offer),'apply-offer')
      const doc = await payload.findByID({ collection: 'offers',id: result.localId,depth: 0 })
      expect(doc).toMatchObject({ title: 'Product',status: 'draft',amazon: { asin: 'FIXTURE',priceCents: 2499,primeEligible: true } })
      const localNetwork = await payload.findByID({ collection: 'affiliate-networks',id: doc.network as number,depth: 0 })
      expect(localNetwork.name).toBe('Network')
      expect(doc.network).not.toBe(101)
      const author = await release('authors','103',{ displayName: 'Editor',slug: 'editor',role: 'editor',gdprRegion: 'other',gdprLawfulBasis: 'not_applicable',credentials: [{ title: 'Editor' }] })
      await receive(author)
      const authorCopy = await applyMasterRelease(req,masterReference(author),'apply-author')
      expect(await payload.findByID({ collection: 'authors',id: authorCopy.localId,depth: 0 })).toMatchObject({ sites: [37],credentials: [{ title: 'Editor' }] })
      const collision = await payload.create({ collection: 'authors',req,overrideAccess: false,
        data: { id: authorCopy.localId,displayName: 'ID takeover',slug: 'forged-id',sites: [37] } as never }).then(() => null,error => error)
      expect(collision).toBeInstanceOf(Error)
      const causes: string[] = []
      for (let error: Error | undefined = collision;error && causes.length < 5;error = error.cause as Error | undefined) causes.push(error.message)
      expect(causes.join(' ')).toContain('identity')
      expect((await payload.findByID({ collection: 'authors',id: authorCopy.localId,depth: 0 })).displayName).toBe('Editor')
      const profile = await release('pipeline-profiles','104',profileData)
      const template = await release('tenant-prompt-templates','105',{ key: 'serp_brief_user',body: 'Source template {{term}}' },{ pipelineProfile: masterReference(profile) })
      await receive(template,[profile])
      const templateCopy = await applyMasterRelease(req,masterReference(template),'apply-template')
      const templateDoc = await payload.findByID({ collection: 'tenant-prompt-templates',id: templateCopy.localId,depth: 0 })
      expect(templateDoc).toMatchObject({ body: 'Source template {{term}}',masterEnabled: false })
      const localProfile = await payload.findByID({ collection: 'pipeline-profiles',id: templateDoc.pipelineProfile as number,depth: 0 })
      expect(localProfile).toMatchObject({ name: profileData.name,isDefault: false,tavilyEnabled: false,sectionParallelism: 2,articleStrategy: { targetWords: 1600 } })
      for (const item of [await release('keyword-batch-presets','106',{ name: 'Quick wins',slug: 'quick',batchMode: 'quick_wins',pillarKeywordId: 123 }),
        await release('social-platforms','107',{ name: 'Social',slug: 'social',status: 'active' }),
        await release('site-layouts','108',{ layoutKey: 'template1',name: 'Layout' })]) {
        await receive(item)
        const copy = await applyMasterRelease(req,masterReference(item),`apply-${item.recordId}`)
        const copied = await payload.findByID({ collection: item.collection,id: copy.localId,depth: 0 })
        expect(copied).toMatchObject({ centralSource: { recordId: item.recordId,revision: 1 } })
        if (item.collection === 'keyword-batch-presets') expect(copied).toHaveProperty('pillarKeywordId',null)
      }
      expect(external).not.toHaveBeenCalled()
      expect(await contexts[1].binding.prepare('SELECT COUNT(*) AS n FROM site_master_copies').first('n')).toBe(0)
    })
  },30000)

  it('deduplicates concurrent applications and preserves previous local edits and selected profiles',async () => {
    await withSiteContext(contexts[0],async () => {
      const first = await release('pipeline-profiles','201',profileData)
      await receive(first)
      const copies = await Promise.all(Array.from({ length: 8 },async () => applyMasterRelease(await request(),masterReference(first),'concurrent-copy')))
      expect(new Set(copies.map(copy => copy.localId)).size).toBe(1)
      const req = await request(), localId = copies[0].localId
      await payload.update({ collection: 'pipeline-profiles',id: localId,req,overrideAccess: false,data: { description: 'Employee reviewed override' } })
      await payload.update({ collection: 'sites',id: 37,req,overrideAccess: false,data: { pipelineProfile: localId } })
      const before = await payload.findByID({ collection: 'pipeline-profiles',id: localId,depth: 0 })
      const second = await release('pipeline-profiles','201',{ ...profileData,name: 'New version',description: 'Central changed description' },{},2)
      await receive(second)
      const next = await applyMasterRelease(req,masterReference(second),'revision-two-copy')
      expect(next.localId).not.toBe(localId)
      expect(await payload.findByID({ collection: 'pipeline-profiles',id: localId,depth: 0 })).toEqual(before)
      expect((await payload.findByID({ collection: 'sites',id: 37,depth: 0 })).pipelineProfile).toBe(localId)
      expect(await applyMasterRelease(req,masterReference(first),'concurrent-copy')).toEqual(copies[0])
      await expect(applyMasterRelease(req,masterReference(second),'concurrent-copy')).rejects.toThrow('conflict')
      await expect(payload.delete({ collection: 'pipeline-profiles',id: localId,req,overrideAccess: false })).rejects.toThrow('retired')
    })
  },30000)

  it('atomically rolls back dependencies, mappings and receipt on a later row failure, then recovers by exact retry',async () => {
    await withSiteContext(contexts[0],async () => {
      const db = contexts[0].binding, req = await request()
      const network = await release('affiliate-networks','301',{ name: 'Rollback network',slug: 'rollback',status: 'active' })
      const offer = await release('offers','302',{ title: 'Rollback offer',status: 'active' },{ network: masterReference(network) })
      await receive(offer,[network])
      await db.exec("CREATE TRIGGER fail_master_copy BEFORE INSERT ON offers WHEN NEW.central_source_record_id='302' BEGIN SELECT RAISE(ABORT,'injected copy failure'); END")
      await expect(applyMasterRelease(req,masterReference(offer),'rollback-copy')).rejects.toThrow('injected')
      expect(await db.prepare("SELECT COUNT(*) AS n FROM site_master_copies WHERE record_id IN ('301','302')").first('n')).toBe(0)
      expect(await db.prepare("SELECT COUNT(*) AS n FROM affiliate_networks WHERE central_source_record_id='301'").first('n')).toBe(0)
      expect(await db.prepare("SELECT COUNT(*) AS n FROM site_master_operations WHERE operation_id='rollback-copy'").first('n')).toBe(0)
      await db.exec('DROP TRIGGER fail_master_copy')
      const copy = await applyMasterRelease(req,masterReference(offer),'rollback-copy')
      expect((await payload.findByID({ collection: 'offers',id: copy.localId })).title).toBe('Rollback offer')
    })
  },30000)

  it('requires a site manager and valid business fields, even for an otherwise valid received digest',async () => {
    await withSiteContext(contexts[0],async () => {
      const author = await release('authors','401',{ displayName: 'Invalid privacy',role: 'editor',gdprRegion: 'eu',gdprLawfulBasis: 'not_applicable' })
      await receive(author)
      await expect(applyMasterRelease(await request('editor'),masterReference(author),'editor-denied')).rejects.toThrow('manager')
      await expect(applyMasterRelease(await request(),masterReference(author),'privacy-denied')).rejects.toThrow('GDPR')
      const preset = await release('keyword-batch-presets','402',{ name: 'Invalid count',slug: 'invalid',batchMode: 'default',defaultBatchLimit: 1000 })
      await receive(preset)
      await expect(applyMasterRelease(await request(),masterReference(preset),'invalid-field')).rejects.toThrow('defaultBatchLimit')
      expect(await contexts[0].binding.prepare("SELECT COUNT(*) AS n FROM site_master_operations WHERE operation_id IN ('editor-denied','privacy-denied','invalid-field')").first('n')).toBe(0)
    })
  },30000)

  it('keeps copied prompts inactive until CAS selection, rejects stale reviews and preserves exact retry semantics',async () => {
    await withSiteContext(contexts[0],async () => {
      const req = await request(), key = 'domain_gen_audience_system' as const
      const original = await payload.create({ collection: 'tenant-prompt-templates',req,overrideAccess: false,data: { key,body: 'Employee approved global' } })
      const source = await release('tenant-prompt-templates','501',{ key,body: 'New central prompt' },{ pipelineProfile: null })
      await receive(source)
      const copy = await applyMasterRelease(req,masterReference(source),'apply-new-global')
      const target = await payload.findByID({ collection: 'tenant-prompt-templates',id: copy.localId,depth: 0 })
      expect(await loadTenantPromptTemplateBody(payload,11,key)).toBe('Employee approved global')
      await payload.update({ collection: 'tenant-prompt-templates',id: copy.localId,req,overrideAccess: false,data: { masterEnabled: true } as never })
      expect(await loadTenantPromptTemplateBody(payload,11,key)).toBe('Employee approved global')
      const refreshed = await payload.findByID({ collection: 'tenant-prompt-templates',id: copy.localId,depth: 0 })
      const selection = { operationId: 'choose-global',targetId: copy.localId,expectedTargetUpdatedAt: refreshed.updatedAt,
        previous: { id: original.id,updatedAt: original.updatedAt } }
      await expect(selectMasterPrompt(req,{ ...selection,operationId: 'stale-review',expectedTargetUpdatedAt: stamp })).rejects.toThrow('refresh')
      await expect(selectMasterPrompt(await request('editor'),selection)).rejects.toThrow('manager')
      await selectMasterPrompt(req,selection)
      expect(await loadTenantPromptTemplateBody(payload,11,key)).toBe('New central prompt')
      expect((await payload.findByID({ collection: 'tenant-prompt-templates',id: original.id,depth: 0 })).body).toBe(original.body)
      const active = await payload.findByID({ collection: 'tenant-prompt-templates',id: copy.localId,depth: 0 })
      const old = await payload.findByID({ collection: 'tenant-prompt-templates',id: original.id,depth: 0 })
      await selectMasterPrompt(req,{ operationId: 'restore-local',targetId: old.id,expectedTargetUpdatedAt: old.updatedAt,previous: { id: active.id,updatedAt: active.updatedAt } })
      await selectMasterPrompt(req,selection)
      expect(await loadTenantPromptTemplateBody(payload,11,key)).toBe('Employee approved global')
      expect(target).toMatchObject({ masterEnabled: false })
    })
  },30000)

  it('uses only global prompts for non-pipeline domain, category and trust-page entrypoints',async () => {
    await withSiteContext(contexts[0],async () => {
      const req = await request()
      const profile = await payload.create({ collection: 'pipeline-profiles',req,overrideAccess: false,data: { name: 'Scoped',slug: 'scoped' } })
      for (const key of ['domain_gen_audience_system','category_slots_shortname_system','trust_pages_bundle_system'] as const) {
        if (key !== 'domain_gen_audience_system') await payload.create({ collection: 'tenant-prompt-templates',req,overrideAccess: false,data: { key,body: 'Employee approved global' } })
        await payload.create({ collection: 'tenant-prompt-templates',req,overrideAccess: false,data: { key,body: 'Wrong profile-only prompt',pipelineProfile: profile.id } })
        expect(await loadTenantPromptTemplateBody(payload,11,key,profile.id)).toBe('Wrong profile-only prompt')
      }
      expect((await resolveAudienceStepPrompts(payload,11,{ mainProduct: 'Fixture',siteName: 'Site',niche: '',currentAudience: '' })).system).toBe('Employee approved global')
      expect((await resolveCategorySlotsShortnamePrompts(payload,11,[{ id: 37,site_id: 37,main_product: 'Fixture',force: false,site_name: 'Site',target_audience: 'People' }])).systemPrompt).toBe('Employee approved global')
      const site = await payload.findByID({ collection: 'sites',id: 37,depth: 0 })
      expect((await resolveTrustPagesBundlePrompts(payload,11,site)).system).toBe('Employee approved global')
    })
  },30000)

  it('serializes competing prompt selections and rolls back a failed activation without disabling the previous choice',async () => {
    await withSiteContext(contexts[0],async () => {
      const req = await request(), key = 'domain_gen_domain_system' as const, db = contexts[0].binding
      const old = await payload.create({ collection: 'tenant-prompt-templates',req,overrideAccess: false,data: { key,body: 'Original choice' } })
      const choices = []
      for (const revision of [1,2]) {
        const source = await release('tenant-prompt-templates','601',{ key,body: `Choice ${revision}` },{ pipelineProfile: null },revision)
        await receive(source)
        const copy = await applyMasterRelease(req,masterReference(source),`copy-choice-${revision}`)
        choices.push(await payload.findByID({ collection: 'tenant-prompt-templates',id: copy.localId,depth: 0 }))
      }
      const outcomes = await Promise.allSettled(choices.map(async (target,index) => selectMasterPrompt(await request(),{
        operationId: `competing-choice-${index}`,targetId: target.id,expectedTargetUpdatedAt: target.updatedAt,previous: { id: old.id,updatedAt: old.updatedAt } })))
      expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
      const active = await payload.find({ collection: 'tenant-prompt-templates',where: { and: [{ key: { equals: key } },{ masterEnabled: { equals: true } }] },depth: 0 })
      expect(active.docs).toHaveLength(1)
      const winner = active.docs[0], target = choices.find(doc => doc.id !== winner.id)!
      const select = { operationId: 'failed-activation',targetId: target.id,expectedTargetUpdatedAt: target.updatedAt,previous: { id: winner.id,updatedAt: winner.updatedAt } }
      await db.exec(`CREATE TRIGGER fail_activation BEFORE UPDATE ON tenant_prompt_templates WHEN NEW.id=${target.id} AND NEW.master_enabled=1 BEGIN SELECT RAISE(ABORT,'injected activation failure'); END`)
      await expect(selectMasterPrompt(req,select)).rejects.toThrow('injected')
      expect(await loadTenantPromptTemplateBody(payload,11,key)).toBe(winner.body)
      expect(await db.prepare("SELECT COUNT(*) AS n FROM site_master_operations WHERE operation_id='failed-activation'").first('n')).toBe(0)
      await db.exec('DROP TRIGGER fail_activation')
      await selectMasterPrompt(req,select)
      expect(await loadTenantPromptTemplateBody(payload,11,key)).toBe(target.body)
    })
  },30000)

  it('maps the same central release independently in two sites and rejects request reuse and identity rewriting',async () => {
    const source = await release('pipeline-profiles','701',profileData)
    let fromA: PayloadRequest
    await withSiteContext(contexts[0],async () => {
      fromA = await request()
      await receive(source)
      const copy = await applyMasterRelease(fromA,masterReference(source),'two-site-copy')
      await payload.update({ collection: 'pipeline-profiles',id: copy.localId,req: fromA,overrideAccess: false,data: { description: 'Site A review' } })
    })
    await withSiteContext(contexts[1],async () => {
      const req = await request('manager','b')
      await receiveMasterRelease(masterReference(source),{ readBundle: async () => ({ siteId: 'b',localSiteId: 82,routingVersion: 1,
        centralTenantId: 1,root: masterReference(source),releases: [source] }) })
      await expect(applyMasterRelease(fromA,masterReference(source),'wrong-context')).rejects.toThrow('Cross-context')
      const copy = await applyMasterRelease(req,masterReference(source),'two-site-copy')
      const doc = await payload.findByID({ collection: 'pipeline-profiles',id: copy.localId,depth: 0 })
      expect(doc.description).not.toBe('Site A review')
      expect(doc.tenant).toBe(22)
      await expect(contexts[1].binding.prepare('UPDATE pipeline_profiles SET id=999 WHERE id=?').bind(copy.localId).run()).rejects.toThrow('identity')
      await expect(contexts[1].binding.prepare("UPDATE pipeline_profiles SET central_source_record_id='999' WHERE id=?").bind(copy.localId).run()).rejects.toThrow('identity')
      await expect(contexts[1].binding.prepare('DELETE FROM pipeline_profiles WHERE id=?').bind(copy.localId).run()).rejects.toThrow('identity')
      await expect(contexts[1].binding.prepare("UPDATE site_master_copies SET local_id=999 WHERE record_id='701'").run()).rejects.toThrow('immutable')
      await contexts[1].binding.prepare("UPDATE tenants SET central_source_record_id='2' WHERE id=22").run()
      await expect(applyMasterRelease(req,masterReference(source),'after-tenant-transfer')).rejects.toThrow('Cross-tenant')
      await contexts[1].binding.prepare("UPDATE tenants SET central_source_record_id='1' WHERE id=22").run()
    })
  },30000)

  it('preserves published article IDs, URLs, profile snapshots and reviewed offer placement when newer masters are applied',async () => {
    await withSiteContext(contexts[0],async () => {
      const req = await request()
      const network = await release('affiliate-networks','801',{ name: 'Preserved network',slug: 'preserved',status: 'active' })
      const offer = await release('offers','802',{ title: 'Reviewed product',slug: 'reviewed-product',status: 'active' },{ network: masterReference(network) })
      const profile = await release('pipeline-profiles','803',profileData)
      await receive(offer,[network]); await receive(profile)
      const offerCopy = await applyMasterRelease(req,masterReference(offer),'preserved-offer')
      const profileCopy = await applyMasterRelease(req,masterReference(profile),'preserved-profile')
      const category = await payload.create({ collection: 'categories',data: { name: 'Reviewed category',slug: 'reviewed-category',locale: 'en',site: 37 } })
      await payload.update({ collection: 'offers',id: offerCopy.localId,req,overrideAccess: false,data: { slug: 'employee-product-url',status: 'active',
        categories: [category.id],sites: [37],featuredOnHomeForSites: [37] } })
      const author = await payload.create({ collection: 'authors',data: { displayName: 'Article author',slug: 'article-author',sites: [37] } })
      // Trusted fixture of content already approved before synchronization.
      const article = await payload.create({ collection: 'articles',data: { title: 'Reviewed article',slug: 'employee-article-url',locale: 'en',site: 37,
        status: 'published',author: author.id,categories: [category.id],relatedOffers: [offerCopy.localId],pipelineProfile: profileCopy.localId,
        pipelineProfileSnapshot: { reviewed: true,words: 1600 } } as never })
      const beforeArticle = await payload.findByID({ collection: 'articles',id: article.id,depth: 0 })
      expect(beforeArticle.pipelineProfileSnapshot).toEqual({ reviewed: true,words: 1600 })
      const beforeOffer = await payload.findByID({ collection: 'offers',id: offerCopy.localId,depth: 0 })
      const nextOffer = await release('offers','802',{ title: 'Changed central product',slug: 'changed-product',status: 'active' },{ network: masterReference(network) },2)
      const nextProfile = await release('pipeline-profiles','803',{ ...profileData,sectionParallelism: 4 },{},2)
      await receive(nextOffer,[network]); await receive(nextProfile)
      await applyMasterRelease(req,masterReference(nextOffer),'next-preserved-offer')
      await applyMasterRelease(req,masterReference(nextProfile),'next-preserved-profile')
      expect(await payload.findByID({ collection: 'articles',id: article.id,depth: 0 })).toEqual(beforeArticle)
      expect(await payload.findByID({ collection: 'offers',id: offerCopy.localId,depth: 0 })).toEqual(beforeOffer)
      expect(beforeArticle.status).toBe('published')
      expect(beforeOffer.categories).toEqual([category.id])
      expect(beforeOffer.featuredOnHomeForSites).toEqual([37])
    })
  },30000)

  it('retains the highest observed ID across deletions when allocating a new copy',async () => {
    await withSiteContext(contexts[0],async () => {
      const req = await request()
      await payload.create({ collection: 'authors',data: { id: 5000,displayName: 'Historical local author',slug: 'historical-local',sites: [37] } as never })
      await payload.delete({ collection: 'authors',id: 5000 })
      const source = await release('authors','901',{ displayName: 'New master author',slug: 'new-master',role: 'editor',gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' })
      await receive(source)
      const copy = await applyMasterRelease(req,masterReference(source),'after-deleted-history')
      expect(copy.localId).toBeGreaterThan(5000)
      expect((await payload.findByID({ collection: 'authors',id: copy.localId,depth: 0 })).displayName).toBe('New master author')
    })
  },30000)
})
