import assert from 'node:assert/strict'
import type { Payload } from 'payload'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import { provisionDigest, type ProvisionPlan } from '../../src/site-control/provisionPlan'
import { readSiteRegistration, registerSite } from '../../src/site-control/registry'
import { withSiteContext } from '../../src/site-runtime/context'
import { syncSiteIdentityProjection } from '../../src/site-runtime/identityProjection'

export type SeedDependencies = {
  journal: ProvisionJournal; centralDatabase: D1Database; siteDatabase: D1Database;
  centralPayload: Payload; sitePayload: Payload; preflight: () => Promise<void>;
  afterLocalSeed?: () => Promise<void>;
}

/** Continue an owned, schema-ready operation. Mutable labels are copied once;
 * the receipt hashes the immutable seed identity, not future editorial content.
 * No route is activated, password copied, or existing permission overwritten. */
export async function seedProvisionedSite(plan: ProvisionPlan,mode: 'dry-run' | 'apply',deps: SeedDependencies) {
  if (!['dry-run','apply'].includes(mode)) throw new Error('Explicit seed mode required')
  const { journal,centralDatabase: central,siteDatabase: local,centralPayload,sitePayload } = deps
  await deps.preflight()
  const preview = await journal.preview(plan)
  if (preview.mode !== 'resume' || !preview.operation.databaseId || preview.operation.checkpoint < 2 ||
    preview.operation.checkpoint > 3 || preview.operation.completedAt) throw new Error('Seed requires an owned schema-ready operation')
  const databaseId = preview.operation.databaseId
  assert.equal(centralPayload.config.custom?.payloadRole,'central')
  assert.equal(sitePayload.config.custom?.payloadRole,'site')
  const schema = await journal.step(plan.operationId,'schema')
  assert.equal(schema?.receipt?.databaseId,databaseId)
  assert.equal(schema?.receipt?.schemaDigest,plan.schemaDigest)
  assert.equal(schema?.receipt?.schemaVersion,plan.schemaVersion)
  const ownership = await local.prepare('SELECT operation_id,site_id,account_id,database_id,digest,schema_version,completed FROM site_schema_bootstrap WHERE id=1').first()
  assert.deepEqual(ownership,{ operation_id: plan.operationId,site_id: plan.siteId,account_id: plan.accountId,
    database_id: databaseId,digest: plan.schemaDigest,schema_version: plan.schemaVersion,completed: 1 },'Seed database ownership mismatch')
  const identity = { databaseId,siteId: plan.siteId,localSiteId: plan.localSiteId,tenantId: plan.tenantId,ownerUserId: plan.ownerUserId }
  const intentDigest = provisionDigest(JSON.stringify({ operationId: plan.operationId,...identity,seedVersion: 1 }))
  const receipt = { ...identity,contentDigest: provisionDigest(JSON.stringify(identity)) }
  const desired = { siteId: plan.siteId,localSiteId: plan.localSiteId,databaseId,bindingName: plan.bindingName,
    workerGroup: plan.workerGroup,adminHost: plan.adminHost,schemaVersion: plan.schemaVersion,routingVersion: 1,
    migrationState: 'provisioning' as const,timezone: plan.timezone,productionEnabled: false,operationId: plan.operationId }
  const inspect = async () => {
    const registration = await readSiteRegistration(central,plan.siteId)
    if (registration) assert.deepEqual(registration,desired,'Seed cannot alter an existing route')
    const centralSites = (await central.prepare('SELECT id,runtime_site_id,tenant_id,created_by_id FROM sites WHERE id=? OR runtime_site_id=?')
      .bind(plan.localSiteId,plan.siteId).all()).results
    if (centralSites.length) {
      assert.ok(registration,'Refusing unowned central site record')
      assert.deepEqual(centralSites,[{ id: plan.localSiteId,runtime_site_id: plan.siteId,tenant_id: plan.tenantId,created_by_id: plan.ownerUserId }],'Central seed identity conflict')
    }
    const grants = (await central.prepare('SELECT user_id,role FROM site_runtime_access WHERE site_id=?').bind(plan.siteId).all()).results
    if (grants.length) {
      assert.ok(registration,'Refusing unowned site permission')
      assert.deepEqual(grants,[{ user_id: String(plan.ownerUserId),role: 'manager' }],'Seed permission changed; do not restore revoked roles')
    }
    const sites = (await local.prepare('SELECT id,slug,tenant_id FROM sites').all()).results
    const tenants = (await local.prepare('SELECT id,central_source_record_id FROM tenants').all()).results
    const users = (await local.prepare('SELECT id,central_user_id FROM users').all<{ id: number; central_user_id: string }>()).results
    if (sites.length) assert.deepEqual(sites,[{ id: plan.localSiteId,slug: plan.siteId,tenant_id: plan.tenantId }],'Local seed site conflict')
    if (tenants.length) assert.deepEqual(tenants,[{ id: plan.tenantId,central_source_record_id: String(plan.tenantId) }],'Local seed tenant conflict')
    if (users.length) assert.ok(users.length === 1 && users[0].central_user_id === String(plan.ownerUserId) && Number.isSafeInteger(users[0].id) && users[0].id > 0,'Local seed identity conflict')
    const source = await central.prepare('SELECT id,name,slug FROM tenants WHERE id=?').bind(plan.tenantId).first<{ id: number; name: string; slug: string }>()
    assert.ok(source && source.name && source.slug,'Central tenant missing')
    assert.equal(await central.prepare('SELECT id FROM users WHERE id=?').bind(plan.ownerUserId).first('id'),plan.ownerUserId,'Central owner missing')
    return { registration,centralSites,grants,sites,tenants,users,source }
  }
  const before = await inspect(), prior = await journal.step(plan.operationId,'seed')
  if (!prior && (before.registration || before.centralSites.length || before.grants.length || before.sites.length || before.tenants.length || before.users.length)) {
    throw new Error('Refusing seed records created before our intent')
  }
  if (prior && prior.intentDigest !== intentDigest) throw new Error('Seed intent changed')
  const complete = (state: Awaited<ReturnType<typeof inspect>>) => {
    assert.ok(state.registration && state.centralSites.length === 1 && state.grants.length === 1 && state.sites.length === 1 && state.tenants.length === 1 && state.users.length === 1,'Seed reconciliation incomplete')
  }
  if (prior?.receipt) { complete(before); assert.deepEqual(prior.receipt,receipt,'Seed receipt conflict') }
  if (mode === 'dry-run') return { mode,operationId: plan.operationId,...identity,checkpoint: preview.operation.checkpoint,mutations: false as const }
  const lease = await journal.claim(plan.operationId,{ reconcilePending: true })
  let failed = false,heartbeat = Promise.resolve()
  const guard = async () => { if (failed) throw new Error('Seed lease lost; reconcile before continuing'); await journal.heartbeat(lease) }
  const timer = setInterval(() => { heartbeat = heartbeat.then(guard).catch(() => { failed = true }) },30000)
  timer.unref()
  try {
    const state = await journal.begin(lease,'seed',intentDigest)
    if (state !== 'completed') {
      const current = await inspect()
      if (state === 'new' && (current.registration || current.centralSites.length || current.grants.length || current.sites.length || current.tenants.length || current.users.length)) {
        throw new Error('Seed target became occupied')
      }
      await guard()
      await registerSite(central,desired)
      const localWrite = async <T>(write: () => Promise<T>) => {
        await guard()
        return withSiteContext({ siteId: plan.siteId,localSiteId: plan.localSiteId,binding: local,requestHost: plan.adminHost,
          routingVersion: 1,currentRoutingVersion: () => 1,identity: null },write)
      }
      if (!current.tenants.length) await localWrite(() => sitePayload.create({ collection: 'tenants',data: {
        id: plan.tenantId,name: current.source.name,slug: current.source.slug,
        centralSource: { recordId: String(plan.tenantId),revision: 1,syncedAt: prior?.startedAt ?? new Date().toISOString() } } as never }))
      if (!current.users.length) await localWrite(() => syncSiteIdentityProjection({ siteId: plan.siteId,localSiteId: plan.localSiteId,
        userId: String(plan.ownerUserId),displayName: `Staff ${plan.ownerUserId}`,role: 'manager',routingVersion: 1 }))
      if (!current.sites.length) await localWrite(() => sitePayload.create({ collection: 'sites',data: { id: plan.localSiteId,
        name: plan.name,slug: plan.siteId,tenant: plan.tenantId,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never }))
      await deps.afterLocalSeed?.()
      if (!current.centralSites.length) {
        await guard()
        const owner = await centralPayload.findByID({ collection: 'users',id: plan.ownerUserId,depth: 0 })
        await centralPayload.create({ collection: 'sites',user: { ...owner,collection: 'users' },data: { id: plan.localSiteId,name: plan.name,
          tenant: plan.tenantId,runtimeSiteId: plan.siteId,publicLocaleCodes: ['en'],defaultPublicLocale: 'en' } as never })
      }
      if (!current.grants.length) {
        await guard()
        await central.prepare('INSERT INTO site_runtime_access (site_id,user_id,role) VALUES (?,?,\'manager\') ON CONFLICT DO NOTHING').bind(plan.siteId,String(plan.ownerUserId)).run()
      }
    }
    await guard()
    complete(await inspect())
    await journal.finish(lease,'seed',intentDigest,receipt)
    return { mode,operationId: plan.operationId,...receipt,checkpoint: 3,mutations: state !== 'completed' }
  } finally { clearInterval(timer); await heartbeat; await journal.release(lease) }
}
