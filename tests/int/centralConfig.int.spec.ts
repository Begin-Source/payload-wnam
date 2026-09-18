// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { createLocalReq, getPayload, type Payload, type SanitizedConfig } from 'payload'
import { createCentralPayloadConfig } from '../../src/site-control/config'
import { migrateCentralRoleState } from '../../src/application-roles/schema'
import { costSourceDigest, ingestSiteCost, reconcileEmployeeCosts, type CostRecord } from '../../src/site-control/costLedger'
import { registerSite } from '../../src/site-control/registry'
import { writeRoleFixture } from '../runtime/writeRoleFixture'
import { withSiteContext } from '../../src/site-runtime/context'
import { OpenAIConfig } from '../../src/utilities/aiOpenAIConfigImport'
import { Users } from '../../src/collections/Users'
import { publishMasterFromPayload } from '../../src/site-control/masterPublisher'
import { masterReference } from '../../src/site-control/masterSnapshot'
import { applyP1CentralSchema, P1_CENTRAL_V1, P1_CENTRAL_V2, P1_CENTRAL_V3, P1_CENTRAL_V4, P1_CENTRAL_V5, P1_CENTRAL_V8 } from '../../scripts/p1-central-schema'
import { applyP1Schema, roleSchemaDigest, type RoleSchema } from '../../scripts/p1-schema'
import { provisionAdmissionSchemaObjects } from '../../src/site-control/provisionAdmissionSchema'
import { provisionDispatchSchemaObjects } from '../../src/site-control/provisionDispatchSchema'
import { provisionDispatchRunSchemaObjects } from '../../src/site-control/provisionDispatchRunSchema'
import { groupReleaseSchemaObjects } from '../../src/site-control/groupReleaseSchema'
import { siteProvisionSchemaObjects } from '../../src/site-control/provisionSchema'
import { siteLifecycleSchemaObjects } from '../../src/site-control/lifecycleSchema'
import { dataDeliverySchemaObjects } from '../../src/site-control/dataDeliverySchema'

vi.mock('../../src/payload.config', () => { throw new Error('Central role imported shared configuration') })
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; getR2Bucket: (name: string) => Promise<R2Bucket>; dispose: () => Promise<void> }
let centralSchema: RoleSchema
let database: D1Database, config: SanitizedConfig, payload: Payload
let admin: NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>
const capability = vi.fn(async () => { throw new Error('Unexpected AI capability') })
const period = { employeeId: 9, tenantId: 1, start: '2026-08-01T00:00:00.000Z', endExclusive: '2026-09-01T00:00:00.000Z' }

describe('independent central Payload configuration and native finance path', () => {
  beforeAll(async () => {
    const fieldsBefore = Users.fields.length
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { CENTRAL: 'complete-central-config', ...Object.fromEntries(['V1','V2','V3','V4','V5','V6','V8','FRESH','INTERRUPT','DRIFT'].map(name => [name,`central-upgrade-${name}`])) }, r2Buckets: { R2: 'central-assets' } })
    database = await mf.getD1Database('CENTRAL')
    const startupSQL = vi.fn((sql: string) => database.prepare(sql))
    const boundDatabase = new Proxy(database, { get(target,key) {
      if (key === 'prepare') return startupSQL
      const value = Reflect.get(target,key)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const options = { database: boundDatabase, bucket: await mf.getR2Bucket('R2'), secret: 'central-config-isolated-test-only',
      generationModels: OpenAIConfig.models, authorizeAiGeneration: capability }
    config = await createCentralPayloadConfig(options)
    const second = await createCentralPayloadConfig(options)
    expect(second.collections.map(collection => collection.slug)).toEqual(config.collections.map(collection => collection.slug))
    expect(Users.fields).toHaveLength(fieldsBefore)
    payload = await getPayload({ config, key: 'independent-central-config' })
    expect(capability).not.toHaveBeenCalled()
    expect(startupSQL).not.toHaveBeenCalled()
    const adapter = payload.db as unknown as { schema: unknown; defaultDrizzleSnapshot: unknown;
      requireDrizzleKit: () => { generateDrizzleJson: (schema: unknown) => unknown; generateMigration: (before: unknown, after: unknown) => Promise<string[]> } }
    const kit = adapter.requireDrizzleKit()
    const statements = await kit.generateMigration(adapter.defaultDrizzleSnapshot,await kit.generateDrizzleJson(adapter.schema))
    for (let offset = 0; offset < statements.length; offset += 25) await database.batch(statements.slice(offset,offset + 25).map(sql => database.prepare(sql)))
    await migrateCentralRoleState(database)
    centralSchema = { role: 'central',objects: (await database.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid")
      .all<RoleSchema['objects'][number]>()).results }
    for (const id of [1,2]) await payload.create({ collection: 'tenants', data: { id, name: `Tenant ${id}`, slug: `tenant-${id}`, domain: `tenant-${id}.example.invalid` } })
    // Explicit trusted bootstrap fixture. Anonymous central API signup is denied.
    const bootstrap = { id: 7, collection: 'users', email: 'admin@example.invalid', roles: ['super-admin'] } as typeof admin
    const doc = await payload.create({ collection: 'users', user: bootstrap, data: { id: 7, email: 'admin@example.invalid', password: 'native-central-test-only-password', roles: ['super-admin'], tenants: [{ tenant: 1 },{ tenant: 2 }] } })
    admin = { ...doc, collection: 'users' }
    for (const [id,role,tenant] of [[8,'finance',1],[9,'site-manager',1],[10,'site-manager',2]] as const) {
      await payload.create({ collection: 'users', user: admin, data: { id, email: `staff-${id}@example.invalid`, password: 'native-central-test-only-password', roles: [role], tenants: [{ tenant }] } })
    }
    for (const [siteId,id,tenant] of [['a',37,1],['b',82,2]] as const) {
      await registerSite(database,{ siteId, localSiteId: id, databaseId: `${id.toString().padStart(8,'0')}-1111-4111-8111-111111111111`,
        bindingName: `SITE_D1_${siteId.toUpperCase()}`, workerGroup: 'group-1', adminHost: `cms-site-${siteId}.beginos.org`,
        schemaVersion: 1, routingVersion: 1, migrationState: 'active', timezone: 'UTC', productionEnabled: false, operationId: `provision-${siteId}` })
      await payload.create({ collection: 'sites', user: admin, data: { id, name: `Site ${siteId}`, tenant, runtimeSiteId: siteId, primaryDomain: `${siteId}.example.invalid`,
        publicLocaleCodes: ['en'], defaultPublicLocale: 'en' } as never })
    }
    await writeRoleFixture(database,'central')
  }, 60000)
  afterAll(async () => { await mf?.dispose() })

  it('sanitizes the complete central relation graph without site content or startup capabilities', () => {
    expect(config.custom.payloadRole).toBe('central')
    const slugs = config.collections.map(collection => collection.slug)
    for (const slug of ['users','tenants','teams','sites','offers','authors','knowledge-base','commission-statements','affiliate-earnings-rows','payload-preferences']) expect(slugs).toContain(slug)
    for (const slug of ['articles','pages','categories','site-blueprints','workflow-jobs','original-evidence','private-media','workflows']) expect(slugs).not.toContain(slug)
    expect(config.collections.find(collection => collection.slug === 'users')!.auth.disableLocalStrategy ?? false).toBe(false)
    expect(config.collections.find(collection => collection.slug === 'authors')!.flattenedFields.map(field => field.name)).not.toContain('sites')
    expect(config.collections.find(collection => collection.slug === 'offers')!.flattenedFields.map(field => field.name)).not.toContain('categories')
    expect(config.collections.find(collection => collection.slug === 'keyword-batch-presets')!.flattenedFields.map(field => field.name)).not.toContain('pillarKeywordId')
  })

  it('publishes authorized central masters with pinned relationships and rejects stale source or unauthorized publishers', async () => {
    const network = await payload.create({ collection: 'affiliate-networks',user: admin,overrideAccess: false,
      data: { name: 'Release network',slug: 'release-network',tenant: 1 } as never })
    const req = await createLocalReq({ user: admin },payload)
    const input = { collection: 'affiliate-networks' as const,recordId: String(network.id),expectedRevision: 0,
      expectedUpdatedAt: network.updatedAt,operationId: 'central-config-network',relations: {} }
    const release = await publishMasterFromPayload(database,req,input)
    expect(release).toMatchObject({ revision: 1,tenantId: 1,data: { name: 'Release network' } })
    const staff = await payload.findByID({ collection: 'users',id: 9,depth: 0 })
    await expect(publishMasterFromPayload(database,await createLocalReq({ user: { ...staff,collection: 'users' } },payload),input)).rejects.toThrow('permission')
    const manager = await payload.create({ collection: 'users',user: admin,data: { email: 'master-manager@example.invalid',
      password: 'native-central-test-only-password',roles: ['general-manager'],tenants: [{ tenant: 1 }] } })
    const managerReq = await createLocalReq({ user: { ...manager,collection: 'users' } },payload)
    expect(await publishMasterFromPayload(database,managerReq,input)).toEqual(release)
    const foreign = await payload.create({ collection: 'affiliate-networks',user: admin,overrideAccess: false,
      data: { name: 'Foreign network',slug: 'foreign-network',tenant: 2 } as never })
    await expect(publishMasterFromPayload(database,managerReq,{ ...input,recordId: String(foreign.id),
      expectedUpdatedAt: foreign.updatedAt,operationId: 'unauthorized-foreign-publish' })).rejects.toThrow()
    await expect(publishMasterFromPayload(database,managerReq,{ ...input,collection: 'site-layouts' })).rejects.toThrow('Global master')
    const offer = await payload.create({ collection: 'offers',user: admin,overrideAccess: false,
      data: { title: 'Released product',network: network.id,tenant: 1 } as never })
    const offerInput = { collection: 'offers' as const,recordId: String(offer.id),expectedRevision: 0,
      expectedUpdatedAt: offer.updatedAt,operationId: 'central-config-offer',relations: { network: masterReference(release) } }
    expect((await publishMasterFromPayload(database,req,offerInput)).relations.network).toEqual(masterReference(release))
    await expect(publishMasterFromPayload(database,req,{ ...offerInput,operationId: 'bad-network-map',relations: { network: { ...masterReference(release),recordId: '999' } } })).rejects.toThrow('source mismatch')
    await payload.update({ collection: 'affiliate-networks',id: network.id,user: admin,data: { name: 'Changed source' },overrideAccess: false })
    // Exact operation retries return the immutable original, even after edits.
    expect(await publishMasterFromPayload(database,req,input)).toEqual(release)
    await expect(publishMasterFromPayload(database,req,{ ...input,expectedRevision: 1,operationId: 'stale-ui' })).rejects.toThrow('refresh')
  },30000)

  it('keeps credential login central, denies anonymous signup and rejects site-context reuse', async () => {
    const login = await payload.login({ collection: 'users', data: { email: 'staff-9@example.invalid', password: 'native-central-test-only-password' } })
    expect(login.user?.id).toBe(9)
    expect(login.token).toBeTruthy()
    await expect(payload.create({ collection: 'users', data: { email: 'anonymous@example.invalid', password: 'unauthorized-test-only', roles: ['user'] }, overrideAccess: false })).rejects.toThrow()
    await withSiteContext({ siteId: 'a', localSiteId: 37, binding: database, identity: null, routingVersion: 1, currentRoutingVersion: () => 1 }, async () => {
      await expect(payload.find({ collection: 'users' })).rejects.toThrow('Central Payload cannot run inside a site request')
    })
  })

  it('preserves tenant isolation for shared masters and validates private author data', async () => {
    for (const tenant of [1,2]) await payload.create({ collection: 'authors', user: admin, data: { displayName: `Author ${tenant}`, tenant } as never, overrideAccess: false })
    const staff = await payload.findByID({ collection: 'users', id: 9, depth: 0 })
    const result = await payload.find({ collection: 'authors', user: { ...staff, collection: 'users' }, overrideAccess: false })
    expect(result.docs.map(doc => doc.displayName)).toEqual(['Author 1'])
    await expect(payload.create({ collection: 'authors', user: { ...staff, collection: 'users' }, data: { displayName: 'Denied', tenant: 1 } as never, overrideAccess: false })).rejects.toThrow()
    await expect(payload.create({ collection: 'authors', user: admin, data: { displayName: 'Privacy fixture', tenant: 1, gdprRegion: 'eu', gdprLawfulBasis: 'not_applicable' } as never })).rejects.toThrow('GDPR')
  })

  it('preserves registered site metadata on PATCH and prevents CRUD repointing or retirement', async () => {
    const original = await payload.findByID({ collection: 'sites', id: 37, depth: 0 })
    const updated = await payload.update({ collection: 'sites', id: 37, user: admin, overrideAccess: false, data: { notes: 'Central note', primaryDomain: 'forged.example.invalid', domainWorkflowStatus: 'done' } })
    expect(updated).toMatchObject({ notes: 'Central note', primaryDomain: original.primaryDomain, slug: original.slug, domainWorkflowStatus: original.domainWorkflowStatus })
    await expect(payload.update({ collection: 'sites', id: 37, data: { runtimeSiteId: 'b' } as never })).rejects.toThrow('immutable')
    await expect(payload.delete({ collection: 'sites', id: 37 })).rejects.toThrow('Retire sites')
  })

  it('keeps staff account self-service from changing payout rates or organization assignment', async () => {
    const staff = await payload.findByID({ collection: 'users', id: 9, depth: 0 })
    const result = await payload.update({ collection: 'users', id: 9, user: { ...staff, collection: 'users' }, overrideAccess: false,
      data: { profitSharePct: 99, leaderCutPctOverride: 99, opsCutPctOverride: 99, teamLead: 10, opsManager: 10, tenants: [{ tenant: 2 }] } })
    expect(result.profitSharePct).not.toBe(99)
    expect(result.leaderCutPctOverride).not.toBe(99)
    expect(result.opsCutPctOverride).not.toBe(99)
    expect(result.teamLead).not.toBe(10)
    expect(result.opsManager).not.toBe(10)
    expect(result.tenants?.map(row => typeof row.tenant === 'object' ? row.tenant.id : row.tenant)).toEqual([1])
    const authorized = await payload.update({ collection: 'users', id: 9, user: admin, overrideAccess: false, data: { profitSharePct: 30 } })
    expect(authorized.profitSharePct).toBe(30)
  })

  it('saves and approves finance against reconciled central costs, then blocks payment after revision', async () => {
    const userDoc = await payload.findByID({ collection: 'users', id: 8, depth: 0 })
    const finance = { ...userDoc, collection: 'users' as const }
    const data = { kind: 'employee' as const, sourceEmployee: 9, recipient: 9, tenant: 1, periodStart: period.start,
      periodEnd: '2026-08-31T00:00:00.000Z', status: 'draft' as const }
    await expect(payload.create({ collection: 'commission-statements', user: finance, overrideAccess: false, data })).rejects.toThrow('unavailable')
    const record: CostRecord = { siteId: 'a', collection: 'articles', recordId: '5', kind: 'ai', revision: 1, employeeId: 9,
      tenantId: 1, recordCreatedAt: '2026-08-12T00:00:00.000Z', amountMicrousd: 1_000_000, state: 'confirmed' }
    await ingestSiteCost(database,'a',record)
    await reconcileEmployeeCosts(database,period,await Promise.all(['a','b'].map(async siteId => ({ siteId, digest: await costSourceDigest(siteId,period,siteId === 'a' ? [record] : []),
      sourceRevision: 'fixture-independent-export', observedThrough: '2026-09-16T00:00:00.000Z' }))),new Date('2026-09-17T00:00:00.000Z'))
    const batch = await payload.create({ collection: 'affiliate-earnings-imports', user: finance, data: { tenant: 1, fileName: 'fixture.csv',
      periodStart: period.start, periodEnd: data.periodEnd } as never, overrideAccess: false })
    await payload.create({ collection: 'affiliate-earnings-rows', user: finance, data: { batch: batch.id, tenant: 1, recipient: 9, periodStart: period.start,
      periodEnd: data.periodEnd, totalEarningsUsd: 100, trackingId: 'fixture-20' } as never, overrideAccess: false })
    const draft = await payload.create({ collection: 'commission-statements', user: finance, data, overrideAccess: false })
    expect(draft).toMatchObject({ grossEarningsUsd: 100, aiCostsUsd: 1, netProfitUsd: 99, payoutAmountUsd: 29.7 })
    const approved = await payload.update({ collection: 'commission-statements', id: draft.id, user: finance, data: { status: 'approved' }, overrideAccess: false })
    expect(approved.status).toBe('approved')
    await ingestSiteCost(database,'a',{ ...record, revision: 2, amountMicrousd: 2_000_000 })
    await expect(payload.update({ collection: 'commission-statements', id: draft.id, user: finance, data: { status: 'paid' }, overrideAccess: false })).rejects.toThrow()
    expect((await payload.findByID({ collection: 'commission-statements', id: draft.id })).status).toBe('approved')
    const revised = { ...record, revision: 2, amountMicrousd: 2_000_000 }
    await reconcileEmployeeCosts(database,period,await Promise.all(['a','b'].map(async siteId => ({ siteId, digest: await costSourceDigest(siteId,period,siteId === 'a' ? [revised] : []),
      sourceRevision: 'fixture-corrected-export', observedThrough: '2026-09-16T00:00:00.000Z' }))),new Date('2026-09-17T00:00:00.000Z'))
    for (const status of ['draft','approved','paid'] as const) await payload.update({ collection: 'commission-statements', id: draft.id, user: finance, data: { status }, overrideAccess: false })
    await ingestSiteCost(database,'a',{ ...record, revision: 3, amountMicrousd: 3_000_000 })
    const paid = await payload.update({ collection: 'commission-statements', id: draft.id, user: finance, data: { notes: 'Payment metadata' }, overrideAccess: false })
    expect(paid).toMatchObject({ status: 'paid', notes: 'Payment metadata', payoutAmountUsd: 29.4 })
    await expect(payload.update({ collection: 'commission-statements', id: draft.id, data: { payoutAmountUsd: 999 } })).rejects.toThrow('immutable')
  }, 30000)
  it('initializes configuration/assets and preserves central cost epoch on operational retries',async () => {
    const original = await database.prepare('SELECT revision FROM central_cost_epoch WHERE id=1').first<number>('revision')
    expect(original).not.toBeNull()
    await database.prepare('UPDATE central_cost_epoch SET revision=revision+1 WHERE id=1').run()
    await migrateCentralRoleState(database)
    expect(await database.prepare('SELECT revision FROM central_cost_epoch WHERE id=1').first('revision')).toBe(original!+1)
    for (const table of ['central_config_releases','central_asset_releases','central_asset_publications']) {
      expect(await database.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').bind('table',table).first('name')).toBe(table)
    }
  })

  const previousSchema = (version: number): RoleSchema => {
    const excluded = new Set<string>([
      ...dataDeliverySchemaObjects,
      ...provisionDispatchRunSchemaObjects,
      ...(version < 6 ? provisionDispatchSchemaObjects : []),
      ...(version < 5 ? provisionAdmissionSchemaObjects : []),
      ...(version < 4 ? groupReleaseSchemaObjects : []),
      ...(version < 3 ? siteProvisionSchemaObjects : []),
      ...(version < 2 ? siteLifecycleSchemaObjects : []),
    ])
    const previous = { ...centralSchema,objects: centralSchema.objects.filter(item => !excluded.has(item.name)) }
    if (version < 6) expect(roleSchemaDigest(previous.objects)).toBe([P1_CENTRAL_V1,P1_CENTRAL_V2,P1_CENTRAL_V3,P1_CENTRAL_V4,P1_CENTRAL_V5][version-1])
    return previous
  }
  it.each([1,2,3,4,5,6])('upgrades reviewed complete central v%i to data delivery v9 without losing data or migration receipts',async version => {
    const db = await mf.getD1Database(`V${version}`), previous = previousSchema(version)
    await applyP1Schema(db,previous,`p1-central-schema-v${version}`)
    await db.prepare("INSERT INTO tenants (id,name,slug,domain) VALUES (999,'Preserved tenant','preserved-tenant','preserved.example.invalid')").run()
    const result = await applyP1CentralSchema(db,centralSchema)
    expect(result).toMatchObject({ operationId: 'p1-central-schema-v9',created: dataDeliverySchemaObjects.length })
    expect(await db.prepare('SELECT name FROM tenants WHERE id=999').first('name')).toBe('Preserved tenant')
    const history = (await db.prepare('SELECT operation_id,from_digest,to_digest,applied_at FROM site_control_schema_migrations ORDER BY operation_id').all()).results
    expect(history).toHaveLength(9-version)
    expect((await applyP1CentralSchema(db,centralSchema)).created).toBe(0)
    expect((await db.prepare('SELECT operation_id,from_digest,to_digest,applied_at FROM site_control_schema_migrations ORDER BY operation_id').all()).results).toEqual(history)
    const found = (await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'site_provision_request%' OR name LIKE 'site_provision_admission_%'").all<{ name: string }>()).results.map(row => row.name)
    expect(found.sort()).toEqual([...provisionAdmissionSchemaObjects].sort())
    const dispatch = (await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'site_provision_dispatch%' OR name LIKE 'site_provision_build_event%'").all<{ name: string }>()).results.map(row => row.name)
    expect(dispatch.sort()).toEqual([...provisionDispatchSchemaObjects,...provisionDispatchRunSchemaObjects].sort())
    // Old application code may run during the additive migration. Its tables,
    // counters and rows retain the same columns and remain writable.
    await db.prepare("UPDATE tenants SET name='Still writable' WHERE id=999").run()
    expect(await db.prepare('SELECT name FROM tenants WHERE id=999').first('name')).toBe('Still writable')
    await expect(applyP1Schema(db,previous,`p1-central-schema-v${version}`)).rejects.toThrow('operation conflict')
    if (process.env.WORKERS_CI === '1') console.log(JSON.stringify({ event: 'central_admission_upgrade_verified',fromVersion: version,
      toVersion: 9,digest: result.digest,objects: result.objects,migrationReceipts: history.length,dataPreserved: true,retryUnchanged: true,remoteDeployment: false }))
  },30000)

  it('upgrades the deployed central v8 schema to v9 with only reviewed delivery objects',async () => {
    const db = await mf.getD1Database('V8')
    const deliveryObjects = new Set<string>(dataDeliverySchemaObjects)
    const v8 = { ...centralSchema,objects: centralSchema.objects.filter(item => !deliveryObjects.has(item.name)) }
    expect(roleSchemaDigest(v8.objects)).toBe(P1_CENTRAL_V8)
    await applyP1Schema(db,v8,'p1-central-schema-v8')
    const result = await applyP1CentralSchema(db,centralSchema)
    expect(result).toMatchObject({ operationId: 'p1-central-schema-v9',created: dataDeliverySchemaObjects.length,upgradedFrom: P1_CENTRAL_V8 })
    expect((await db.prepare('SELECT operation_id FROM site_control_schema_migrations').all()).results)
      .toEqual([{ operation_id: 'p1-central-schema-v9' }])
  },30000)

  it('fresh central v9 installs match the complete role and retain operational state on retries',async () => {
    const db = await mf.getD1Database('FRESH')
    const result = await applyP1CentralSchema(db,centralSchema)
    expect(result).toMatchObject({ operationId: 'p1-central-schema-v9',objects: centralSchema.objects.length,upgradedFrom: null })
    await migrateCentralRoleState(db)
    await db.prepare('UPDATE central_cost_epoch SET revision=23 WHERE id=1').run()
    await migrateCentralRoleState(db)
    expect((await applyP1CentralSchema(db,centralSchema)).created).toBe(0)
    expect(await db.prepare('SELECT revision FROM central_cost_epoch WHERE id=1').first('revision')).toBe(23)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_control_schema_migrations').first('n')).toBe(0)
    if (process.env.WORKERS_CI === '1') console.log(JSON.stringify({ event: 'central_dispatch_fresh_schema_verified',version: 9,
      digest: result.digest,objects: result.objects,operationalCounterPreserved: true,remoteDeployment: false }))
  },30000)

  it('rolls back the full dispatch-run migration on DDL failure and resumes an already committed lost response',async () => {
    const db = await mf.getD1Database('INTERRUPT')
    const previous = previousSchema(6),previousDigest = roleSchemaDigest(previous.objects)
    await applyP1Schema(db,previous,'p1-central-schema-v6')
    const interrupted = (lost: boolean) => new Proxy(db,{ get(target,key) {
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        const result = await target.batch(lost ? statements : [...statements,target.prepare('SELECT * FROM injected_missing_table')])
        if (lost) throw new Error('Injected lost migration response')
        return result
      }
      const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(applyP1CentralSchema(interrupted(false),centralSchema)).rejects.toThrow('injected_missing_table')
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name='site_provision_dispatch_runs'").first()).toBeNull()
    expect(await db.prepare('SELECT digest FROM p1_schema_bootstrap WHERE id=1').first('digest')).toBe(previousDigest)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_control_schema_migrations').first('n')).toBe(0)
    await expect(applyP1CentralSchema(interrupted(true),centralSchema)).rejects.toThrow('Injected lost migration response')
    expect((await applyP1CentralSchema(db,centralSchema)).created).toBe(dataDeliverySchemaObjects.length)
    expect((await applyP1CentralSchema(db,centralSchema)).created).toBe(0)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM site_control_schema_migrations').first('n')).toBe(3)
  },30000)

  it('rejects an incomplete dispatch-run schema or drifted v6 before installing run objects',async () => {
    const db = await mf.getD1Database('DRIFT')
    const previous = previousSchema(6),previousDigest = roleSchemaDigest(previous.objects)
    await applyP1Schema(db,previous,'p1-central-schema-v6')
    await expect(applyP1CentralSchema(db,{ ...centralSchema,objects: centralSchema.objects.filter(item => item.name !== 'site_provision_dispatch_run_requested') })).rejects.toThrow('Incomplete central v7 dispatch run schema')
    await db.prepare('DROP TRIGGER site_provision_dispatch_requested').run()
    await expect(applyP1CentralSchema(db,centralSchema)).rejects.toThrow('source schema drift')
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name='site_provision_dispatch_runs'").first()).toBeNull()
    expect(await db.prepare('SELECT digest FROM p1_schema_bootstrap WHERE id=1').first('digest')).toBe(previousDigest)
  },30000)

})
