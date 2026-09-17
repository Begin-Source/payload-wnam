import { assertSiteId, crossSiteReference } from './registry'

export type CostRecord = Readonly<{
  siteId: string; collection: 'articles' | 'media' | 'private-media' | 'sites'; recordId: string
  kind: 'ai' | 'dfs'; revision: number; employeeId: number; tenantId: number; recordCreatedAt: string; amountMicrousd: number; state: 'pending' | 'confirmed'
}>
export type CostPeriod = Readonly<{ employeeId: number; tenantId: number; start: string; endExclusive: string }>
export type CostSourceProof = Readonly<{ siteId: string; digest: string; observedThrough: string; sourceRevision: string }>
export type ReconciledCosts = Readonly<{ id: string; amountMicrousd: number; aiMicrousd: number; dfsMicrousd: number; checkedAt: string; sources: CostSourceProof[] }>

const fields = `site_id AS siteId, collection, record_id AS recordId, cost_kind AS kind, revision, employee_id AS employeeId,
  tenant_id AS tenantId, record_created_at AS recordCreatedAt, amount_microusd AS amountMicrousd, state`
function timestamp(value: string): void {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Canonical UTC timestamp required')
}
function positive(value: number): boolean { return Number.isSafeInteger(value) && value > 0 }
function validateRecord(record: CostRecord): void {
  crossSiteReference(record.siteId, record.collection, record.recordId)
  timestamp(record.recordCreatedAt)
  if (typeof record.recordId !== 'string' || !['articles','media','private-media','sites'].includes(record.collection) || !positive(record.revision) || !positive(record.employeeId) || !positive(record.tenantId) ||
    !Number.isSafeInteger(record.amountMicrousd) || record.amountMicrousd < 0 || !['pending','confirmed'].includes(record.state) || !['ai','dfs'].includes(record.kind)) {
    throw new Error('Invalid central cost record')
  }
}
function validatePeriod(period: CostPeriod): void {
  timestamp(period.start); timestamp(period.endExclusive)
  if (!positive(period.employeeId) || !positive(period.tenantId) || period.start >= period.endExclusive) throw new Error('Invalid cost period')
}
async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
function tuple(record: CostRecord): unknown[] {
  return [record.siteId, record.collection, record.recordId, record.kind, record.revision, record.employeeId, record.tenantId, record.recordCreatedAt, record.amountMicrousd, record.state]
}

/** Used by the independent source exporter too. Input must be the complete
 * period snapshot, including pending costs; duplicate records are invalid.
 */
export async function costSourceDigest(siteId: string, period: CostPeriod, records: readonly CostRecord[]): Promise<string> {
  assertSiteId(siteId); validatePeriod(period)
  if (records.some(record => record.siteId !== siteId || record.employeeId !== period.employeeId || record.tenantId !== period.tenantId ||
    record.recordCreatedAt < period.start || record.recordCreatedAt >= period.endExclusive)) throw new Error('Source cost snapshot scope mismatch')
  const rows = records.map(record => { validateRecord(record); return tuple(record) })
  rows.sort((a, b) => JSON.stringify(a.slice(0,4)) < JSON.stringify(b.slice(0,4)) ? -1 : 1)
  const keys = rows.map(row => JSON.stringify(row.slice(0,4)))
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate source cost record')
  return hash([siteId, period.employeeId, period.tenantId, period.start, period.endExclusive, rows])
}

/** Internal ingestion capability only. Caller authenticates the source worker
 * and resolves its stable site ID; no client-supplied target or account token.
 * The event and latest projection change together in a native D1 transaction.
 */
export async function ingestSiteCost(database: D1Database, authenticatedSiteId: string, record: CostRecord): Promise<void> {
  validateRecord(record)
  if (authenticatedSiteId !== record.siteId) throw new Error('Cost source site mismatch')
  const digest = await hash(tuple(record))
  await database.batch([
    database.prepare(`INSERT INTO central_cost_events
      (site_id,collection,record_id,cost_kind,revision,employee_id,tenant_id,record_created_at,amount_microusd,state,digest)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(site_id,collection,record_id,cost_kind,revision) DO NOTHING`)
      .bind(...tuple(record), digest),
    database.prepare(`INSERT INTO central_cost_records
      SELECT * FROM central_cost_events WHERE site_id = ? AND collection = ? AND record_id = ? AND cost_kind = ? AND revision = ? AND digest = ?
      ON CONFLICT(site_id,collection,record_id,cost_kind) DO UPDATE SET revision = excluded.revision,
        employee_id = excluded.employee_id, tenant_id = excluded.tenant_id, record_created_at = excluded.record_created_at,
        amount_microusd = excluded.amount_microusd, state = excluded.state, digest = excluded.digest
      WHERE excluded.revision > central_cost_records.revision`)
      .bind(record.siteId, record.collection, record.recordId, record.kind, record.revision, digest),
  ])
  const event = await database.prepare(`SELECT digest FROM central_cost_events WHERE site_id = ? AND collection = ? AND record_id = ? AND cost_kind = ? AND revision = ?`)
    .bind(record.siteId, record.collection, record.recordId, record.kind, record.revision).first<{ digest: string }>()
  if (event?.digest !== digest) throw new Error('Conflicting cost event revision')
}

const completeCoverage = `NOT EXISTS (SELECT 1 FROM site_runtime_registry r WHERE NOT EXISTS
  (SELECT 1 FROM json_each(?) p WHERE json_extract(p.value, '$.siteId') = r.site_id))`

/** Explicit reconciliation, never a fallback in a financial read. Proofs must
 * come from independent authoritative source exports, including zero-cost
 * sources. It queries central D1 only and cannot fan out to the site fleet.
 */
export async function reconcileEmployeeCosts(database: D1Database, period: CostPeriod, proofs: readonly CostSourceProof[], now = new Date()): Promise<ReconciledCosts> {
  validatePeriod(period)
  if (period.endExclusive > now.toISOString()) throw new Error('Cost period is still open')
  const registry = await database.prepare('SELECT site_id AS siteId FROM site_runtime_registry ORDER BY site_id').all<{ siteId: string }>()
  const sites = registry.results.map(row => row.siteId)
  const registered = new Set(sites)
  if (!sites.length || proofs.length !== sites.length || new Set(proofs.map(proof => proof.siteId)).size !== proofs.length ||
    proofs.some(proof => !registered.has(proof.siteId))) throw new Error('Complete registered source coverage required')
  for (const proof of proofs) {
    assertSiteId(proof.siteId); timestamp(proof.observedThrough)
    if (!/^[a-f0-9]{64}$/.test(proof.digest) || proof.observedThrough < period.endExclusive || proof.observedThrough > now.toISOString() ||
      typeof proof.sourceRevision !== 'string' || !proof.sourceRevision || proof.sourceRevision.length > 128) throw new Error('Invalid cost source proof')
  }
  const epoch = await database.prepare('SELECT revision FROM central_cost_epoch WHERE id = 1').first<{ revision: number }>()
  if (!epoch) throw new Error('Central cost schema unavailable')
  const records: CostRecord[] = []
  // Bounded SQL pages; the epoch CAS below rejects a mixed snapshot if any
  // concurrent ingestion changes the ledger while pages/digests are collected.
  for (let offset = 0; ; offset += 500) {
    const page = await database.prepare(`SELECT ${fields} FROM central_cost_records
      WHERE employee_id = ? AND tenant_id = ? AND record_created_at >= ? AND record_created_at < ?
      ORDER BY site_id,collection,record_id,cost_kind LIMIT 500 OFFSET ?`).bind(period.employeeId, period.tenantId, period.start, period.endExclusive, offset).all<CostRecord>()
    records.push(...page.results)
    if (page.results.length < 500) break
  }
  if (records.some(record => record.state !== 'confirmed')) throw new Error('Unconfirmed costs prevent reconciliation')
  let amountMicrousd = 0, aiMicrousd = 0, dfsMicrousd = 0
  const bySite = new Map<string, CostRecord[]>()
  for (const record of records) {
    const siteRecords = bySite.get(record.siteId) ?? []
    siteRecords.push(record); bySite.set(record.siteId,siteRecords)
    amountMicrousd += record.amountMicrousd
    if (record.kind === 'ai') aiMicrousd += record.amountMicrousd
    else dfsMicrousd += record.amountMicrousd
    if (!Number.isSafeInteger(amountMicrousd)) throw new Error('Cost total exceeds safe integer precision')
  }
  for (const proof of proofs) {
    if (await costSourceDigest(proof.siteId, period, bySite.get(proof.siteId) ?? []) !== proof.digest) throw new Error('Cost source reconciliation mismatch')
  }
  const id = crypto.randomUUID(), checkedAt = now.toISOString()
  const sources = proofs.map(({ siteId, digest, observedThrough, sourceRevision }) => ({ siteId, digest, observedThrough, sourceRevision }))
    .sort((a,b) => a.siteId < b.siteId ? -1 : 1)
  const sourcesJson = JSON.stringify(sources)
  const result = await database.prepare(`INSERT INTO central_cost_reconciliations
    (id,employee_id,tenant_id,period_start,period_end_exclusive,amount_microusd,ai_microusd,dfs_microusd,sources_json,checked_at,valid)
    SELECT ?,?,?,?,?,?,?,?,?,?,1 WHERE (SELECT revision FROM central_cost_epoch WHERE id = 1) = ? AND ${completeCoverage}`)
    .bind(id, period.employeeId, period.tenantId, period.start, period.endExclusive, amountMicrousd, aiMicrousd, dfsMicrousd, sourcesJson, checkedAt, epoch.revision, sourcesJson).run()
  if (result.meta.changes !== 1) throw new Error('Cost ledger or registered sources changed during reconciliation')
  return { id, amountMicrousd, aiMicrousd, dfsMicrousd, checkedAt, sources }
}

/** Missing, incomplete or invalidated summaries are not zero-cost periods. */
export async function readReconciledCosts(database: D1Database, period: CostPeriod): Promise<ReconciledCosts> {
  validatePeriod(period)
  const row = await database.prepare(`SELECT id, amount_microusd AS amountMicrousd, ai_microusd AS aiMicrousd, dfs_microusd AS dfsMicrousd, checked_at AS checkedAt, sources_json AS sourcesJson
    FROM central_cost_reconciliations c WHERE employee_id = ? AND tenant_id = ? AND period_start = ? AND period_end_exclusive = ? AND valid = 1
      AND NOT EXISTS (SELECT 1 FROM site_runtime_registry r WHERE NOT EXISTS
        (SELECT 1 FROM json_each(c.sources_json) p WHERE json_extract(p.value, '$.siteId') = r.site_id))
    ORDER BY checked_at DESC,id DESC LIMIT 1`).bind(period.employeeId, period.tenantId, period.start, period.endExclusive)
    .first<{ id: string; amountMicrousd: number; aiMicrousd: number; dfsMicrousd: number; checkedAt: string; sourcesJson: string }>()
  if (!row) throw new Error('Reconciled central costs unavailable for this employee and period')
  return { id: row.id, amountMicrousd: row.amountMicrousd, aiMicrousd: row.aiMicrousd, dfsMicrousd: row.dfsMicrousd, checkedAt: row.checkedAt, sources: JSON.parse(row.sourcesJson) as CostSourceProof[] }
}
