// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { migrateSiteControl } from '../../src/site-control/schema'
import { migrateCentralCosts } from '../../src/site-control/costSchema'
import { registerSite, type SiteRegistration } from '../../src/site-control/registry'
import { costSourceDigest, ingestSiteCost, readReconciledCosts, reconcileEmployeeCosts, type CostRecord, type CostSourceProof } from '../../src/site-control/costLedger'
import { centralCommissionGuardSchema, createCentralCommissionStatementHook } from '../../src/site-control/commissionStatement'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }
let database: D1Database
const period = { employeeId: 7, tenantId: 1, start: '2026-08-01T00:00:00.000Z', endExclusive: '2026-09-01T00:00:00.000Z' }
const now = new Date('2026-09-17T03:00:00.000Z')
const registration = (siteId: string, ordinal: number): SiteRegistration => ({ siteId, localSiteId: 37,
  databaseId: `${ordinal.toString().padStart(8,'0')}-1111-4111-8111-111111111111`, bindingName: `SITE_D1_${siteId.toUpperCase()}`,
  workerGroup: 'group-1', adminHost: `cms-site-${siteId}.beginos.org`, schemaVersion: 1, routingVersion: 1,
  migrationState: 'active', timezone: 'UTC', productionEnabled: false, operationId: `provision-${siteId}` })
const cost = (siteId: string, patch: Partial<CostRecord> = {}): CostRecord => ({ siteId, collection: 'articles', recordId: '5',
  kind: 'ai', revision: 1, employeeId: 7, tenantId: 1, recordCreatedAt: '2026-08-12T10:00:00.000Z', amountMicrousd: 1_250_000, state: 'confirmed', ...patch })
async function proofs(records: CostRecord[], sites = ['a','b'], employeeId = period.employeeId): Promise<CostSourceProof[]> {
  return Promise.all(sites.map(async siteId => ({ siteId, digest: await costSourceDigest(siteId, { ...period, employeeId }, records.filter(record => record.siteId === siteId)),
    observedThrough: '2026-09-16T00:00:00.000Z', sourceRevision: 'independent-export-1' })))
}

describe('central cost ledger and complete-source reconciliation on native D1', () => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: '2025-08-15', d1Databases: { CENTRAL: 'cost-ledger-test' } })
    database = await mf.getD1Database('CENTRAL')
    await database.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
    await database.exec('CREATE TABLE tenants (id INTEGER PRIMARY KEY)')
    await database.exec('INSERT INTO tenants VALUES (1),(2)')
    await migrateSiteControl(database)
    await migrateCentralCosts(database)
    await migrateCentralCosts(database)
    // Fields used by the independent central hook and commit-time guards.
    await database.exec('CREATE TABLE commission_statements (id INTEGER PRIMARY KEY, source_employee_id INTEGER, tenant_id INTEGER, period_start TEXT, settlement_end_exclusive TEXT, cost_reconciliation_id TEXT, status TEXT, notes TEXT)')
    await database.batch(centralCommissionGuardSchema.map(sql => database.prepare(sql)))
  }, 30000)
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    for (const table of ['commission_statements','central_cost_records','central_cost_events','central_cost_reconciliations','site_runtime_registry','users']) {
      await database.prepare(`DELETE FROM ${table}`).run()
    }
    await database.exec('INSERT INTO users VALUES (7),(8)')
    await registerSite(database, registration('a',1))
    await registerSite(database, registration('b',2))
  })

  it('deduplicates concurrent deliveries, preserves same IDs across sites and rejects revision conflicts', async () => {
    const a = cost('a'), b = cost('b', { amountMicrousd: 2_000_000 })
    await Promise.all(Array.from({ length: 12 }, () => ingestSiteCost(database,'a',a)))
    await ingestSiteCost(database,'b',b)
    const summary = await reconcileEmployeeCosts(database,period,await proofs([a,b]),now)
    expect(summary.amountMicrousd).toBe(3_250_000)
    expect(await readReconciledCosts(database,period)).toEqual(summary)
    await ingestSiteCost(database,'a',a)
    expect((await readReconciledCosts(database,period)).id).toBe(summary.id)
    await expect(ingestSiteCost(database,'a',{ ...a, amountMicrousd: 99 })).rejects.toThrow('Conflicting')
    expect((await readReconciledCosts(database,period)).id).toBe(summary.id)
    expect(await database.prepare('SELECT COUNT(*) AS n FROM central_cost_events').first('n')).toBe(2)
    await expect(ingestSiteCost(database,'b',a)).rejects.toThrow('site mismatch')
  }, 30000)

  it('requires explicit complete coverage and detects missing, unsettled and mismatched records', async () => {
    await expect(readReconciledCosts(database,period)).rejects.toThrow('unavailable')
    const a = cost('a')
    await expect(reconcileEmployeeCosts(database,period,await proofs([a],['a']),now)).rejects.toThrow('coverage')
    await expect(reconcileEmployeeCosts(database,period,await proofs([a]),now)).rejects.toThrow('mismatch')
    await ingestSiteCost(database,'a',{ ...a, state: 'pending' })
    await expect(reconcileEmployeeCosts(database,period,await proofs([a]),now)).rejects.toThrow('Unconfirmed')
    await expect(reconcileEmployeeCosts(database,period,await proofs([]),new Date(period.start))).rejects.toThrow('still open')
  })

  it('allows proven zero cost and invalidates coverage when a registered source is added', async () => {
    const summary = await reconcileEmployeeCosts(database,period,await proofs([]),now)
    expect(summary.amountMicrousd).toBe(0)
    await registerSite(database, registration('c',3))
    await expect(readReconciledCosts(database,period)).rejects.toThrow('unavailable')
    await expect(reconcileEmployeeCosts(database,period,await proofs([]),now)).rejects.toThrow('coverage')
    expect((await reconcileEmployeeCosts(database,period,await proofs([],['a','b','c']),now)).amountMicrousd).toBe(0)
  })

  it('invalidates only affected employee periods and keeps revisions and historical certificates', async () => {
    const first = cost('a')
    await ingestSiteCost(database,'a',first)
    const certificate = await reconcileEmployeeCosts(database,period,await proofs([first]),now)
    await ingestSiteCost(database,'a',cost('a',{ recordId: '6', recordCreatedAt: '2026-09-02T00:00:00.000Z' }))
    expect((await readReconciledCosts(database,period)).id).toBe(certificate.id)
    const revised = { ...first, revision: 2, amountMicrousd: 900_000 }
    await ingestSiteCost(database,'a',revised)
    await expect(readReconciledCosts(database,period)).rejects.toThrow('unavailable')
    await ingestSiteCost(database,'a',first)
    expect((await reconcileEmployeeCosts(database,period,await proofs([revised]),now)).amountMicrousd).toBe(900_000)
    expect(await database.prepare('SELECT valid FROM central_cost_reconciliations WHERE id = ?').bind(certificate.id).first('valid')).toBe(0)
    // Corrections that reassign employee attribution invalidate both scopes.
    await reconcileEmployeeCosts(database,{ ...period, employeeId: 8 },await proofs([],['a','b'],8),now)
    await ingestSiteCost(database,'a',{ ...revised, revision: 3, employeeId: 8 })
    await expect(readReconciledCosts(database,period)).rejects.toThrow('unavailable')
    await expect(readReconciledCosts(database,{ ...period, employeeId: 8 })).rejects.toThrow('unavailable')
  })

  it('rolls back event acceptance if the current projection cannot be saved', async () => {
    await database.exec("CREATE TRIGGER reject_cost BEFORE INSERT ON central_cost_records BEGIN SELECT RAISE(ABORT,'injected cost failure'); END")
    await expect(ingestSiteCost(database,'a',cost('a'))).rejects.toThrow('injected')
    expect(await database.prepare('SELECT COUNT(*) AS n FROM central_cost_events').first('n')).toBe(0)
    await database.exec('DROP TRIGGER reject_cost')
    await ingestSiteCost(database,'a',cost('a'))
    expect(await database.prepare('SELECT COUNT(*) AS n FROM central_cost_records').first('n')).toBe(1)
  })

  it('separates tenant and cost-kind totals and binds zero proofs to the exact source and period', async () => {
    const records = [cost('a'), cost('a',{ kind: 'dfs', amountMicrousd: 250_000 }), cost('b',{ tenantId: 2, amountMicrousd: 99_000_000 })]
    for (const record of records) await ingestSiteCost(database,record.siteId,record)
    const summary = await reconcileEmployeeCosts(database,period,await proofs(records.slice(0,2)),now)
    expect(summary).toMatchObject({ amountMicrousd: 1_500_000, aiMicrousd: 1_250_000, dfsMicrousd: 250_000 })
    const zero = await costSourceDigest('a',period,[])
    expect(await costSourceDigest('b',period,[])).not.toBe(zero)
    expect(await costSourceDigest('a',{ ...period, tenantId: 2 },[])).not.toBe(zero)
    expect(await costSourceDigest('a',{ ...period, start: '2026-08-02T00:00:00.000Z' },[])).not.toBe(zero)
    await expect(costSourceDigest('a',period,[records[2]])).rejects.toThrow('scope mismatch')
  })

  it('rejects a reconciliation raced by native D1 ingestion after snapshot reads', async () => {
    const first = cost('a')
    await ingestSiteCost(database,'a',first)
    const raced = new Proxy(database, { get(target,property) {
      if (property !== 'prepare') { const value = Reflect.get(target,property); return typeof value === 'function' ? value.bind(target) : value }
      return (sql: string) => {
        const statement = target.prepare(sql)
        if (!sql.startsWith('INSERT INTO central_cost_reconciliations')) return statement
        return { bind: (...values: unknown[]) => ({ run: async () => {
          await ingestSiteCost(database,'a',{ ...first, revision: 2, amountMicrousd: 2_000_000 })
          return statement.bind(...values).run()
        } }) }
      }
    } }) as D1Database
    await expect(reconcileEmployeeCosts(raced,period,await proofs([first]),now)).rejects.toThrow('changed during reconciliation')
    await expect(readReconciledCosts(database,period)).rejects.toThrow('unavailable')
  })

  it('calculates central commissions from all earnings pages and reconciled costs without site reads', async () => {
    const records = [cost('a'),cost('a',{ kind: 'dfs', amountMicrousd: 250_000 })]
    for (const record of records) await ingestSiteCost(database,'a',record)
    const costs = await reconcileEmployeeCosts(database,period,await proofs(records),now)
    const find = vi.fn(async ({ collection, page }) => {
      if (collection !== 'affiliate-earnings-rows') throw new Error('Unexpected site collection read')
      return page === 1 ? { docs: Array.from({ length: 500 },(_,index) => ({ id: index + 1, totalEarningsUsd: 1 })), hasNextPage: true }
        : { docs: [{ id: 501, totalEarningsUsd: 10 }], hasNextPage: false }
    })
    const req = { payload: { find, findByID: vi.fn(async () => ({ id: 7, profitSharePct: 30, tenants: [{ tenant: 1 }] })),
      findGlobal: vi.fn(async () => ({ rules: { costInclusion: { ai: true, dfs: true } } })) } } as unknown as PayloadRequest
    const input = { kind: 'employee', sourceEmployee: 7, recipient: 7, tenant: 1, status: 'draft',
      periodStart: '2026-08-01', periodEnd: '2026-08-31', adjustmentsUsd: -2 }
    const hook = createCentralCommissionStatementHook(database)
    const draft = await hook({ req, data: input } as never)
    expect(draft).toMatchObject({ grossEarningsUsd: 510, aiCostsUsd: 1.5, netProfitUsd: 506.5, payoutAmountUsd: 151.95,
      costReconciliationId: costs.id, settlementEndExclusive: period.endExclusive })
    expect(draft.lines.earningsRowIds).toHaveLength(501)
    expect(draft.lines.costReconciliation).not.toHaveProperty('sources')
    expect(find).toHaveBeenCalledTimes(2)
    await expect(hook({ req, data: { ...input, status: 'approved' } } as never)).rejects.toThrow('draft before approving')
    await expect(hook({ req, operation: 'update', originalDoc: { ...draft, status: 'approved' }, data: { payoutAmountUsd: 999 } } as never)).rejects.toThrow('immutable')
    await expect(hook({ req, data: { ...input, tenant: 2 } } as never)).rejects.toThrow('belong to its tenant')
    // Revision arrives after a successful hook read but before the actual write.
    await database.prepare('INSERT INTO commission_statements VALUES (1,?,?,?,?,?,\'draft\',NULL)').bind(7,1,period.start,period.endExclusive,costs.id).run()
    await database.prepare("UPDATE commission_statements SET status = 'approved' WHERE id = 1").run()
    await ingestSiteCost(database,'a',{ ...records[0], revision: 2, amountMicrousd: 9_000_000 })
    await expect(database.prepare("UPDATE commission_statements SET status = 'paid' WHERE id = 1").run()).rejects.toThrow('Current reconciled costs required')
    await expect(hook({ req, data: input } as never)).rejects.toThrow('unavailable')
  })
})
