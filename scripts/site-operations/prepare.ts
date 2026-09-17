import { provisionDigest, type ProvisionPlan } from '../../src/site-control/provisionPlan'
import { ProvisionJournal } from '../../src/site-control/provisionJournal'
import type { RoleSchema } from '../p1-schema'
import { ProvisionCloudflare, type DatabaseInfo } from './cloudflare'
import { initializeProvisionSchema, validateProvisionSchema } from './schema'

export type PreparationDependencies = {
  journal: ProvisionJournal; api: ProvisionCloudflare;
  openDatabase: (databaseId: string) => Promise<{ database: D1Database; close: () => Promise<void> }>;
  preflight: () => Promise<void>;
  afterCreate?: () => Promise<void>;
  initializeState?: (database: D1Database) => Promise<void>;
}
const inspectDatabase = (info: DatabaseInfo,plan: ProvisionPlan,startedAt?: string) => {
  if (info.name !== plan.databaseName || info.read_replication.mode !== 'disabled') throw new Error('Provision database metadata mismatch')
  if (startedAt && Date.parse(info.created_at) < Date.parse(startedAt)-5000) throw new Error('Refusing database created before our recorded intent')
  return { databaseId: info.uuid,databaseName: info.name,readReplication: 'disabled' as const }
}

/** Execute the first two durable provisioning steps against real capabilities.
 * Stops explicitly at schema readiness: no claim of seed/deploy/activation. */
export async function prepareSiteDatabase(plan: ProvisionPlan,schema: RoleSchema,mode: 'dry-run' | 'apply',deps: PreparationDependencies) {
  validateProvisionSchema(plan,schema)
  if (!['dry-run','apply'].includes(mode)) throw new Error('Explicit preparation mode required')
  await deps.preflight()
  const preview = await deps.journal.preview(plan)
  const known = preview.mode === 'resume' ? preview.operation : null
  const found = await deps.api.findDatabase(plan.databaseName)
  const priorIntent = await deps.journal.step(plan.operationId,'database')
  if (found && !priorIntent) throw new Error('Refusing an existing unowned database name')
  if (found) inspectDatabase(found,plan,priorIntent?.startedAt)
  if (known?.databaseId && (!found || known.databaseId !== found.uuid)) throw new Error('Recorded provision database is missing or changed')
  if (mode === 'dry-run') return { mode,siteId: plan.siteId,operationId: plan.operationId,checkpoint: known?.checkpoint ?? 0,
    databaseId: found?.uuid ?? null,createsDatabase: !found,mutations: false as const }
  if (known?.completedAt) throw new Error('Provision already activated; use the verification command')
  if ((known?.checkpoint ?? 0) > 2) throw new Error('Provision advanced beyond database preparation')
  await deps.journal.reserve(plan)
  const lease = await deps.journal.claim(plan.operationId,{ reconcilePending: true })
  let heartbeatFailure: unknown, heartbeat = Promise.resolve()
  const guard = async () => {
    if (heartbeatFailure) throw new Error('Provision heartbeat failed; reconcile before continuing')
    await deps.journal.heartbeat(lease)
  }
  const timer = setInterval(() => {
    heartbeat = heartbeat.then(guard).catch(error => { heartbeatFailure = error })
  },30000)
  timer.unref()
  let resource: Awaited<ReturnType<PreparationDependencies['openDatabase']>> | undefined
  try {
    const databaseIntent = provisionDigest(JSON.stringify({ name: plan.databaseName,primary_location_hint: plan.locationHint,read_replication: { mode: plan.readReplication } }))
    const state = await deps.journal.begin(lease,'database',databaseIntent)
    let actual = found
    if (state === 'new') {
      // Recheck immediately before the first create. An existing name is not
      // adopted merely because the journal has just recorded a new intent.
      if (actual || await deps.api.findDatabase(plan.databaseName)) throw new Error('Provision database name became occupied')
      await guard()
      actual = await deps.api.createDatabase(plan)
      await deps.afterCreate?.()
    } else if (!actual) {
      // No automatic replay: absence may reflect propagation or a create still
      // running after a timeout. Another run can reconcile the same intent.
      throw new Error('Database creation result remains unknown; no create was replayed')
    }
    if (!actual) throw new Error('Provision database unavailable')
    const intent = await deps.journal.step(plan.operationId,'database')
    if (!intent) throw new Error('Provision database intent missing')
    await guard()
    await deps.journal.finish(lease,'database',databaseIntent,inspectDatabase(actual,plan,intent.startedAt))
    resource = await deps.openDatabase(actual.uuid)
    const schemaIntent = provisionDigest(JSON.stringify({ databaseId: actual.uuid,schemaDigest: plan.schemaDigest,schemaVersion: plan.schemaVersion,operationId: plan.operationId }))
    await deps.journal.begin(lease,'schema',schemaIntent)
    // Schema initialization reconciles an ownership receipt and every existing
    // object before idempotent CREATE batches. It never adopts a populated DB.
    const receipt = await initializeProvisionSchema(resource.database,actual.uuid,plan,schema,{
      beforeWrite: guard,initializeState: deps.initializeState,
    })
    await guard()
    await deps.journal.finish(lease,'schema',schemaIntent,receipt)
    return { mode,siteId: plan.siteId,operationId: plan.operationId,checkpoint: 2,databaseId: actual.uuid,
      schemaDigest: receipt.schemaDigest,objects: receipt.objects,mutations: true as const }
  } finally {
    clearInterval(timer)
    await heartbeat
    try { await resource?.close() } finally { await deps.journal.release(lease) }
  }
}
