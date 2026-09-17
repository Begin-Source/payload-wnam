import type { CollectionBeforeChangeHook } from 'payload'
import { parseRelationshipId } from '../utilities/parseRelationshipId'
import { parseCommissionRulesJson, roundMoney } from '../utilities/commissionRulesParse'
import { readReconciledCosts } from './costLedger'

function relation(value: unknown): number {
  const id = parseRelationshipId(value)
  if (!Number.isSafeInteger(id) || id! < 1) throw new Error('Valid central finance relationship required')
  return id!
}
function day(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00\.000Z)?$/.test(value)) throw new Error('UTC calendar date required for settlement')
  const iso = `${value.slice(0,10)}T00:00:00.000Z`
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString() !== iso) throw new Error('Invalid settlement date')
  return iso
}
function money(value: unknown): number {
  if (value == null || typeof value === 'boolean' || value === '') throw new Error('Missing settlement amount')
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 1_000_000))) throw new Error('Invalid settlement amount')
  return amount
}

/** Independent central finance path. It never queries articles/media/site D1s.
 * The deployment must also install centralCommissionGuardSchema so a cost
 * revision between this read and Payload's write cannot approve a stale result.
 */
export function createCentralCommissionStatementHook(database: D1Database): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, req }) => {
    const current = { ...originalDoc, ...data } as Record<string, unknown>
    const previous = operation === 'update' ? originalDoc as Record<string, unknown> : undefined
    const status = String(current.status ?? 'draft')
    if (!['draft','approved','paid'].includes(status)) throw new Error('Invalid settlement status')
    if (!previous && status !== 'draft') throw new Error('Create a draft before approving settlement')
    if (previous?.status === 'paid' && status !== 'paid') throw new Error('Paid settlement cannot be reopened')
    if (status === 'paid' && previous?.status !== 'approved' && previous?.status !== 'paid') throw new Error('Approval required before payment')

    if (previous?.status === 'approved' || previous?.status === 'paid') {
      const keys = ['kind','recipient','sourceEmployee','tenant','periodStart','periodEnd','adjustmentsUsd',
        'grossEarningsUsd','aiCostsUsd','netProfitUsd','pctApplied','payoutAmountUsd','lines','costReconciliationId','settlementEndExclusive']
      for (const key of keys) if (key in data) {
        const normalize = (value: unknown) => ['recipient','sourceEmployee','tenant'].includes(key) ? parseRelationshipId(value) : value
        if (JSON.stringify(normalize(data[key])) !== JSON.stringify(normalize(previous[key]))) throw new Error('Approved settlement amounts and basis are immutable; return to draft first')
      }
      if (status !== 'draft') return data
    }

    const employeeId = relation(current.sourceEmployee), recipientId = relation(current.recipient), tenantId = relation(current.tenant)
    const start = day(current.periodStart), end = day(current.periodEnd)
    const endExclusive = new Date(Date.parse(end) + 86400_000).toISOString()
    if (start >= endExclusive) throw new Error('Invalid settlement period')
    const employee = await req.payload.findByID({ collection: 'users', id: employeeId, depth: 0, overrideAccess: true, req })
    const recipient = recipientId === employeeId ? employee : await req.payload.findByID({ collection: 'users', id: recipientId, depth: 0, overrideAccess: true, req })
    for (const user of [employee, recipient]) {
      if (!user.tenants?.some(row => parseRelationshipId(row.tenant) === tenantId)) throw new Error('Settlement users must belong to its tenant')
    }
    const kind = String(current.kind)
    if ((kind === 'employee' && recipientId !== employeeId) ||
      (kind === 'leader_cut' && parseRelationshipId(employee.teamLead) !== recipientId) ||
      (kind === 'ops_cut' && parseRelationshipId(employee.opsManager) !== recipientId) ||
      !['employee','leader_cut','ops_cut'].includes(kind)) throw new Error('Settlement recipient does not match employee attribution')
    const rulesDoc = await req.payload.findGlobal({ slug: 'commission-rules', depth: 0, overrideAccess: true, req })
    const rules = parseCommissionRulesJson(rulesDoc.rules)
    // Even zero-cost or cost-excluded settlements retain a completeness proof.
    const costs = await readReconciledCosts(database, { employeeId, tenantId, start, endExclusive })
    const includedMicrousd = (rules.costInclusion.ai ? costs.aiMicrousd : 0) + (rules.costInclusion.dfs ? costs.dfsMicrousd : 0)
    let gross = 0
    const earningsRowIds: number[] = []
    for (let page = 1; ; page++) {
      const earnings = await req.payload.find({ collection: 'affiliate-earnings-rows', where: { and: [
        { recipient: { equals: employeeId } }, { tenant: { equals: tenantId } },
        { periodStart: { equals: start } }, { periodEnd: { equals: end } },
      ] }, limit: 500, page, sort: 'id', depth: 0, overrideAccess: true, req })
      for (const row of earnings.docs) { gross += money(row.totalEarningsUsd); earningsRowIds.push(row.id) }
      if (!earnings.hasNextPage) break
    }
    gross = money(gross)
    const aiCosts = includedMicrousd / 1_000_000
    const adjustment = kind === 'employee' ? money(current.adjustmentsUsd ?? 0) : 0
    const net = gross - aiCosts + adjustment
    const pct = kind === 'employee' ? employee.profitSharePct ?? rules.defaultEmployeePct : kind === 'leader_cut'
      ? recipient.leaderCutPctOverride ?? rules.defaultLeaderCutPct : recipient.opsCutPctOverride ?? rules.defaultOpsCutPct
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Invalid settlement percentage')
    return { ...data, periodStart: start, periodEnd: end, settlementEndExclusive: endExclusive,
      grossEarningsUsd: roundMoney(gross,'nearest'), aiCostsUsd: roundMoney(aiCosts,'nearest'), adjustmentsUsd: adjustment,
      netProfitUsd: roundMoney(net,'nearest'), pctApplied: pct, payoutAmountUsd: roundMoney(net * pct / 100,rules.roundingMode),
      costReconciliationId: costs.id,
      lines: { earningsRowIds, rulesSnapshot: rules, costReconciliation: { id: costs.id, checkedAt: costs.checkedAt,
        aiMicrousd: costs.aiMicrousd, dfsMicrousd: costs.dfsMicrousd, includedMicrousd, sourceCount: costs.sources.length } } }
  }
}

/** Install only after the independent central Payload schema supplies both
 * readonly fields: costReconciliationId and settlementEndExclusive.
 * Historical paid records remain editable for payment metadata, while moving
 * an approved record to paid still checks the current reconciliation.
 */
export const centralCommissionGuardSchema = (['INSERT','UPDATE'] as const).map(operation => `
  CREATE TRIGGER IF NOT EXISTS central_commission_${operation.toLowerCase()} BEFORE ${operation} ON commission_statements
  WHEN NEW.status IN ('approved','paid') ${operation === 'UPDATE' ? "AND OLD.status != 'paid'" : "AND NOT EXISTS (SELECT 1 FROM commission_statements old WHERE old.id = NEW.id AND old.status = 'paid')"}
  BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM central_cost_reconciliations c
      WHERE c.id = NEW.cost_reconciliation_id AND c.valid = 1 AND c.employee_id = NEW.source_employee_id AND c.tenant_id = NEW.tenant_id
        AND c.period_start = NEW.period_start AND c.period_end_exclusive = NEW.settlement_end_exclusive
        AND NOT EXISTS (SELECT 1 FROM site_runtime_registry r WHERE NOT EXISTS
          (SELECT 1 FROM json_each(c.sources_json) p WHERE json_extract(p.value, '$.siteId') = r.site_id)))
      THEN RAISE(ABORT,'Current reconciled costs required to approve or pay') END;
  END`)
