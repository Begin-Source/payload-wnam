// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createLocalReq, getPayload, type Payload, type PayloadRequest, type SanitizedConfig } from 'payload'
import { createSitePayloadConfig, type SitePayloadOptions } from '../../src/site-runtime/config'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { Articles } from '../../src/collections/Articles'
import { Sites } from '../../src/collections/Sites'
import { OpenAIConfig } from '../../src/utilities/aiOpenAIConfigImport'
import { articlePublishGate } from '../../src/collections/hooks/articlePublishGate'
import { validateDocLocaleAgainstSite } from '../../src/collections/hooks/validateDocLocaleAgainstSite'
import { authorsGdprValidate } from '../../src/collections/hooks/authorsGdprValidate'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'
import { migrateSiteMasters } from '../../src/site-control/masterSchema'
import { migrateSiteMasterCopies } from '../../src/site-runtime/masterCopySchema'
import { masterDigest, masterReference, projectMasterData, snapshotJSON, type MasterSnapshot } from '../../src/site-control/masterSnapshot'
import { receiveMasterRelease } from '../../src/site-runtime/masterReceiver'

vi.mock('../../src/payload.config', () => { throw new Error('Independent site config imported shared configuration') })
// The storage SDK's development branch explicitly handles Miniflare proxy
// metadata; native Worker R2 uses writeHttpMetadata in cloud runtime tests.
vi.hoisted(() => { vi.stubEnv('NODE_ENV', 'development') })

const scope: SiteContext = { siteId: 'a', localSiteId: 37, binding: { prepare() { throw new Error('Unexpected startup SQL') } } as unknown as D1Database,
  routingVersion: 1, currentRoutingVersion: () => 1, identity: null, requestHost: 'cms-site-a.beginos.org' }
const request = (siteRole?: string): PayloadRequest => ({ user: siteRole ? { id: 7, centralUserId: '7', collection: 'users',
  _strategy: 'central-site-session', siteId: 'a', siteRole } : null }) as PayloadRequest
const capability = vi.fn(async () => { throw new Error('Unexpected external capability') })
const options: SitePayloadOptions = { secret: 'isolated-site-config-test-only',
  identity: { authenticate: capability, redeem: capability, logout: capability },
  publicBucket: { get: capability, put: capability } as unknown as R2Bucket,
  privateBucket: { get: capability, put: capability } as unknown as R2Bucket,
  generationModels: OpenAIConfig.models, authorizeAiGeneration: capability, executeExternalTask: capability }
let config: SanitizedConfig
let payload: Payload
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let contexts: SiteContext[]

describe('independent complete site Payload configuration', () => {
  beforeAll(async () => {
    const collectionCount = Articles.fields.length
    const siteHookCount = Sites.hooks!.beforeChange!.length
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { A: 'full-site-config-a', B: 'full-site-config-b' },
      r2Buckets: { PUBLIC: 'full-site-public', PRIVATE: 'full-site-private' } })
    options.publicBucket = await mf.getR2Bucket('PUBLIC')
    options.privateBucket = await mf.getR2Bucket('PRIVATE')
    config = await createSitePayloadConfig(options)
    const secondConfig = await createSitePayloadConfig(options)
    expect(secondConfig.collections.map(c => c.slug)).toEqual(config.collections.map(c => c.slug))
    expect(secondConfig.collections.find(c => c.slug === 'workflow-runs')!.flattenedFields.length).toBe(
      config.collections.find(c => c.slug === 'workflow-runs')!.flattenedFields.length)
    payload = await getPayload({ config, key: 'independent-site-config' })
    expect(Articles.fields).toHaveLength(collectionCount)
    expect(Sites.hooks!.beforeChange).toHaveLength(siteHookCount)
    expect(capability).not.toHaveBeenCalled()
    // Generate SQL in memory and explicitly provision two disposable test D1s.
    // The application factory itself never migrates or enables schema push.
    const adapter = payload.db as unknown as { schema: unknown; defaultDrizzleSnapshot: unknown;
      requireDrizzleKit: () => { generateDrizzleJson: (schema: unknown) => unknown;
        generateMigration: (before: unknown, after: unknown) => Promise<string[]> } }
    const kit = adapter.requireDrizzleKit()
    const sql = await kit.generateMigration(adapter.defaultDrizzleSnapshot, await kit.generateDrizzleJson(adapter.schema))
    contexts = await Promise.all(['A','B'].map(async (name, index) => {
      const binding = await mf.getD1Database(name)
      for (let offset = 0; offset < sql.length; offset += 25) await binding.batch(sql.slice(offset, offset + 25).map(statement => binding.prepare(statement)))
      await migrateSiteMasters(binding)
      await migrateSiteMasterCopies(binding)
      return { ...scope, siteId: name.toLowerCase(), localSiteId: index ? 82 : 37, binding, requestHost: `cms-site-${name.toLowerCase()}.beginos.org` }
    }))
    for (const context of contexts) await withSiteContext(context, async () => {
      await syncSiteIdentityProjection({ siteId: context.siteId, localSiteId: context.localSiteId!, userId: '7', displayName: 'Staff', role: 'publisher', routingVersion: 1 })
      await payload.create({ collection: 'sites', data: { id: context.localSiteId, name: `Site ${context.siteId}`, slug: context.siteId,
        publicLocaleCodes: ['en'], defaultPublicLocale: 'en' } as never })
    })
  }, 60000)
  afterAll(async () => { await mf?.dispose(); vi.unstubAllEnvs() })

  it('initializes all local business and generated schemas without a site, SQL, RPC or vendor requests', () => {
    const slugs = config.collections.map(c => c.slug)
    for (const slug of ['sites','articles','pages','authors','offers','categories','media','private-media','original-evidence',
      'knowledge-base','workflow-jobs','site-blueprints','workflows','workflow-runs','automation-steps','automation-triggers',
      'plugin-ai-instructions','payload-jobs','payload-preferences','payload-locked-documents']) expect(slugs).toContain(slug)
    for (const slug of ['teams','announcements','commissions','commission-statements','affiliate-earnings-imports',
      'affiliate-earnings-rows','operation-manuals','payload-mcp-api-keys']) expect(slugs).not.toContain(slug)
    expect(payload.authStrategies.map(strategy => strategy.name)).toEqual(['central-site-session'])
    expect(config.custom.localSiteMappingRequired).toBe(true)
    const evidence = config.collections.find(c => c.slug === 'original-evidence')!
    expect(evidence.flattenedFields.find(f => f.name === 'media')).toMatchObject({ relationTo: 'private-media' })
  })

  it('retains content quality, locale, author privacy and design version behavior', () => {
    const articles = config.collections.find(c => c.slug === 'articles')!
    expect(articles.hooks.beforeChange).toContain(articlePublishGate)
    expect(articles.hooks.beforeChange).toContain(validateDocLocaleAgainstSite)
    expect(config.collections.find(c => c.slug === 'authors')!.hooks.beforeValidate).toContain(authorsGdprValidate)
    expect(config.collections.find(c => c.slug === 'site-blueprints')!.versions?.maxPerDoc).toBe(20)
  })

  it('separates anonymous published reads, staff roles, private storage and central-owned writes', async () => {
    const collection = (slug: string) => config.collections.find(c => c.slug === slug)!
    await withSiteContext(scope, async () => {
      const read = collection('articles').access.read
      expect(await read({ req: request() })).toEqual({ and: [{ site: { equals: 37 } }, { status: { equals: 'published' } }] })
      expect(await collection('private-media').access.read({ req: request() })).toBe(false)
      expect(await collection('media').access.read({ req: request() })).toEqual({ site: { equals: 37 } })
      expect(await collection('site-quotas').access.read({ req: request('viewer') })).toEqual({ site: { equals: 37 } })
      expect(await collection('tenants').access.read({ req: request('viewer') })).toBe(true)
      for (const slug of ['users','tenants','site-portfolios','site-quotas','audit-logs','workflow-runs','payload-jobs']) {
        expect(await collection(slug).access.create({ req: request('manager') })).toBe(false)
      }
      for (const slug of ['workflows','automation-triggers','automation-steps','plugin-ai-instructions']) {
        expect(await collection(slug).access.create({ req: request() })).toBe(false)
        expect(await collection(slug).access.create({ req: request('editor') })).toBe(false)
        expect(await collection(slug).access.create({ req: request('manager') })).toBe(true)
      }
      expect(await collection('articles').access.create({ req: request('viewer'), data: { status: 'draft' } })).toBe(false)
      expect(await collection('articles').access.create({ req: request('editor'), data: { status: 'draft' } })).toBe(true)
      expect(await collection('articles').access.create({ req: request('editor'), data: { status: 'published' } })).toBe(false)
      expect(await collection('articles').access.create({ req: request('publisher'), data: { status: 'published' } })).toBe(true)
      expect(await collection('articles').access.update({ req: request('editor'), data: { title: 'Change' } })).toEqual({ and: [{ site: { equals: 37 } }, { status: { not_equals: 'published' } }] })
      expect(await collection('sites').access.delete({ req: request('manager') })).toBe(false)
    })
  })

  it('requires explicit preserved mapping for actual Payload operations, including generated collections', async () => {
    await expect(payload.find({ collection: 'articles' })).rejects.toThrow('context required')
    await withSiteContext({ ...scope, localSiteId: undefined }, async () => {
      await expect(payload.find({ collection: 'articles' })).rejects.toThrow('mapping required')
      await expect(payload.find({ collection: 'payload-preferences' })).rejects.toThrow('mapping required')
      await expect(payload.findGlobal({ slug: 'public-landing' })).rejects.toThrow('mapping required')
    })
  })

  it('edits same-ID categories and authors independently through the full native D1 schema', async () => {
    for (const context of contexts) await withSiteContext(context, async () => {
      const user = { ...request('editor').user!, id: 1, siteId: context.siteId }
      await payload.create({ collection: 'categories', data: { id: 5, name: `Category ${context.siteId}`, slug: 'same', locale: 'en', site: context.localSiteId }, user, overrideAccess: false })
      await payload.create({ collection: 'authors', data: { id: 5, displayName: `Author ${context.siteId}`, slug: 'same', sites: [context.localSiteId!] }, user, overrideAccess: false })
      expect((await payload.findByID({ collection: 'categories', id: 5, user, overrideAccess: false })).name).toBe(`Category ${context.siteId}`)
      expect((await payload.findByID({ collection: 'authors', id: 5, user, overrideAccess: false })).displayName).toBe(`Author ${context.siteId}`)
      await expect(payload.update({ collection: 'categories', id: 5, data: { site: context.localSiteId === 37 ? 82 : 37 }, user, overrideAccess: false })).rejects.toThrow()
    })
  }, 30000)

  it('enforces publication roles and persists quality veto attribution through real Payload writes', async () => {
    const context = contexts[0]
    await withSiteContext(context, async () => {
      const editor = { ...request('editor').user!, id: 1 }
      const publisher = { ...request('publisher').user!, id: 1 }
      await payload.create({ collection: 'articles', data: { id: 50, title: 'Example', slug: 'example', locale: 'en', site: 37, author: 5, status: 'draft' }, user: editor, overrideAccess: false })
      await expect(payload.update({ collection: 'articles', id: 50, data: { status: 'published', author: 5 }, user: editor, overrideAccess: false })).rejects.toThrow()
      const result = await payload.update({ collection: 'articles', id: 50, data: { status: 'published', author: 5,
        _quality: { rawScore: 90, vetoes: ['T04'] } } as never, user: publisher, overrideAccess: false })
      expect(result.status).toBe('draft')
      const vetoes = await payload.find({ collection: 'knowledge-base', where: { severity: { equals: 'veto' } }, user: publisher, overrideAccess: false })
      expect(vetoes.docs).toHaveLength(1)
      expect(vetoes.docs[0].site).toMatchObject({ id: 37 })
      expect((await payload.find({ collection: 'articles', overrideAccess: false })).docs).toHaveLength(0)
      await payload.create({ collection: 'articles', data: { title: 'Public example', slug: 'public-example', locale: 'en', site: 37,
        status: 'published', author: 5, aiCostUsd: 12, aiCostBreakdown: { internal: 'must-not-leak' } } })
      const published = await payload.find({ collection: 'articles', overrideAccess: false })
      expect(published.docs).toHaveLength(1)
      expect(published.docs[0].title).toBe('Public example')
      expect(published.docs[0]).not.toHaveProperty('aiCostUsd')
      expect(published.docs[0]).not.toHaveProperty('aiCostBreakdown')
      expect(published.docs[0]).not.toHaveProperty('createdBy')
    })
  }, 30000)

  it('edits selected tenant masters using site grants and rejects foreign imported copies without legacy tenant roles', async () => {
    for (const context of contexts) await withSiteContext(context,async () => {
      const ownTenant = context.siteId === 'a' ? 11 : 22, foreignTenant = ownTenant + 100
      const centralTenantId = context.siteId === 'a' ? 1 : 2
      for (const id of [ownTenant,foreignTenant]) await payload.create({ collection: 'tenants',
        data: { id,name: `Projection ${id}`,slug: `projection-${id}`,centralSource: { recordId: String(id === ownTenant ? centralTenantId : id),revision: 1,syncedAt: new Date().toISOString() } } as never })
      await payload.update({ collection: 'sites',id: context.localSiteId!,data: { tenant: ownTenant } as never })
      const snapshot: MasterSnapshot = { format: 1,collection: 'affiliate-networks',recordId: '123',revision: 1,tenantId: centralTenantId,
        sourceUpdatedAt: '2026-09-17T04:00:00.000Z',relations: {},data: projectMasterData('affiliate-networks',{ name: 'Candidate network',slug: 'candidate' }) }
      const release = { ...snapshot,digest: await masterDigest(snapshotJSON(snapshot)),operationId: 'native-schema-receipt',createdAt: snapshot.sourceUpdatedAt }
      await receiveMasterRelease(masterReference(release),{ readBundle: async () => ({ siteId: context.siteId,localSiteId: context.localSiteId!,
        routingVersion: 1,centralTenantId,root: masterReference(release),releases: [release] }) })
      expect(await context.binding.prepare("SELECT revision FROM site_master_heads WHERE record_id='123'").first('revision')).toBe(1)
      expect((await payload.find({ collection: 'affiliate-networks' })).docs).toHaveLength(0)
      const manager = { ...request('manager').user!,id: 1,siteId: context.siteId }
      const editor = { ...manager,siteRole: 'editor' }
      const profile = await payload.create({ collection: 'pipeline-profiles',user: manager,overrideAccess: false,
        data: { name: 'Buying intent · 发布质量 80+',slug: 'reviewed-profile' } })
      const preset = await payload.create({ collection: 'keyword-batch-presets',user: manager,overrideAccess: false,
        data: { name: 'Quick-win affiliate',slug: 'quick-win',batchMode: 'quick_wins' } })
      const template = await payload.create({ collection: 'tenant-prompt-templates',user: manager,overrideAccess: false,
        data: { key: 'serp_brief_user',body: 'Reviewed {{term}}',pipelineProfile: profile.id } })
      await payload.update({ collection: 'sites',id: context.localSiteId!,user: manager,overrideAccess: false,
        data: { pipelineProfile: profile.id,keywordBatchPreset: preset.id } })
      for (const [collection,id,data] of [['pipeline-profiles',profile.id,{ description: 'Local review retained' }],
        ['keyword-batch-presets',preset.id,{ description: 'Local preset retained' }],
        ['tenant-prompt-templates',template.id,{ body: 'Updated {{term}}' }]] as const) {
        const updated = await payload.update({ collection,id,data,user: manager,overrideAccess: false })
        expect(updated.tenant).toMatchObject({ id: ownTenant })
        await expect(payload.update({ collection,id,data,user: editor,overrideAccess: false })).rejects.toThrow()
        await expect(payload.update({ collection,id,data: { tenant: foreignTenant } as never,user: manager,overrideAccess: true })).rejects.toThrow('Cross-tenant')
      }
      // Corrupt legacy import: even a manager must not see/edit its tenant.
      await context.binding.prepare('UPDATE pipeline_profiles SET tenant_id=? WHERE id=?').bind(foreignTenant,profile.id).run()
      await expect(payload.findByID({ collection: 'pipeline-profiles',id: profile.id,user: manager,overrideAccess: false })).rejects.toThrow()
      await expect(payload.update({ collection: 'pipeline-profiles',id: profile.id,data: { name: 'Denied' },user: manager,overrideAccess: false })).rejects.toThrow()
      await expect(payload.update({ collection: 'pipeline-profiles',id: profile.id,data: { tenant: ownTenant } as never,user: manager,overrideAccess: true })).rejects.toThrow('Cross-tenant')
      await context.binding.prepare('UPDATE pipeline_profiles SET tenant_id=? WHERE id=?').bind(ownTenant,profile.id).run()
    })
  },30000)

  it('preserves design versions in both databases through wide-row updates', async () => {
    for (const context of contexts) await withSiteContext(context, async () => {
      const user = { ...request('publisher').user!, id: 1, siteId: context.siteId }
      await payload.create({ collection: 'site-blueprints', data: { id: 5, name: `Design ${context.siteId}`, slug: 'same-design', site: context.localSiteId }, user, overrideAccess: false })
      await payload.update({ collection: 'site-blueprints', id: 5, data: { name: `Updated ${context.siteId}` }, user, overrideAccess: false })
      const versions = await payload.findVersions({ collection: 'site-blueprints', where: { parent: { equals: 5 } }, user, overrideAccess: false })
      expect(versions.totalDocs).toBe(2)
      expect(versions.docs[0].version.name).toBe(`Updated ${context.siteId}`)
      await expect(payload.findVersions({ collection: 'site-blueprints', overrideAccess: false })).rejects.toThrow()
    })
  }, 30000)

  it('uploads public and private files to separate native R2 buckets and enforces file access', async () => {
    for (const context of contexts) await withSiteContext(context, async () => {
      const user = { ...request('editor').user!, id: 1, siteId: context.siteId }
      for (const [collection, body] of [['media',`public fixture ${context.siteId}`],['private-media',`private research ${context.siteId}`]] as const) {
        const file = { name: 'same.txt', mimetype: 'text/plain', size: Buffer.byteLength(body), data: Buffer.from(body) }
        const uploaded = await payload.create({ collection: collection as 'media', data: { alt: 'Fixture' }, file, user, overrideAccess: false })
        expect(uploaded.site).toMatchObject({ id: context.localSiteId })
      }
      expect(await (await options.publicBucket.get(`sites/${context.siteId}/same.txt`))!.text()).toBe(`public fixture ${context.siteId}`)
      expect(await (await options.privateBucket.get(`sites/${context.siteId}/same.txt`))!.text()).toBe(`private research ${context.siteId}`)
      const getFile = async (collection: string, authenticated: boolean) => {
        const endpoints = config.collections.find(c => c.slug === collection)!.endpoints
        if (!endpoints) throw new Error('Upload endpoints missing')
        const handler = endpoints.find(endpoint => endpoint.path === '/file/:filename')!.handler
        const req = await createLocalReq({ user: authenticated ? user : undefined,
          req: { routeParams: { collection, filename: 'same.txt' }, headers: new Headers() } }, payload)
        return handler(req)
      }
      await expect(getFile('private-media', false)).rejects.toThrow()
      const publicResponse = await getFile('media', false)
      expect(publicResponse.status).toBe(200)
      expect(await publicResponse.text()).toBe(`public fixture ${context.siteId}`)
      const privateResponse = await getFile('private-media', true)
      expect(privateResponse.status).toBe(200)
      expect(privateResponse.headers.get('cache-control')).toBe('private, no-store')
      expect(await privateResponse.text()).toBe(`private research ${context.siteId}`)
      // Simulate an incomplete legacy import: the object still exists in this
      // site's prefix, but its database record has no valid site attribution.
      for (const [collection, table] of [['media', 'media'], ['private-media', 'private_media']] as const) {
        await context.binding.prepare(`UPDATE ${table} SET site_id = NULL WHERE filename = ?`).bind('same.txt').run()
        await expect(getFile(collection, true)).rejects.toThrow()
        if (collection === 'media') await expect(getFile(collection, false)).rejects.toThrow()
        await context.binding.prepare(`UPDATE ${table} SET site_id = ? WHERE filename = ?`).bind(context.localSiteId!, 'same.txt').run()
      }
    })
  }, 30000)
})
