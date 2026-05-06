import type { CollectionBeforeChangeHook } from 'payload'

import { parseCommissionRulesJson, roundMoney } from '@/utilities/commissionRulesParse'

type UserRow = {
  id: number
  profitSharePct?: number | null
  leaderCutPctOverride?: number | null
  opsCutPctOverride?: number | null
  teamLead?: number | { id: number } | null
  opsManager?: number | { id: number } | null
}

function relId(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'object' && v !== null && 'id' in v) {
    const n = Number((v as { id: unknown }).id)
    return Number.isFinite(n) ? n : null
  }
  return null
}

async function loadUser(payload: import('payload').Payload, id: number): Promise<UserRow | null> {
  try {
    const u = await payload.findByID({
      collection: 'users',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return u as UserRow
  } catch {
    return null
  }
}

/**
 * Recompute cached amounts when `status` is `draft`.
 */
export const recomputeCommissionStatementHook: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation: _operation,
  req,
}) => {
  const next = { ...data } as Record<string, unknown>
  const status = String(next.status ?? (originalDoc as { status?: string })?.status ?? 'draft')
  if (status !== 'draft') {
    return next
  }

  const kind = String(next.kind ?? '')
  const sourceEmployeeId = relId(next.sourceEmployee)
  const recipientId = relId(next.recipient)
  if (!sourceEmployeeId || !recipientId || !['employee', 'leader_cut', 'ops_cut'].includes(kind)) {
    return next
  }

  const rulesGlobal = await req.payload.findGlobal({
    slug: 'commission-rules',
    depth: 0,
    overrideAccess: true,
  })
  const rules = parseCommissionRulesJson(
    (rulesGlobal as { rules?: unknown } | null)?.rules ?? null,
  )

  const periodStart = String(next.periodStart ?? '')
  const periodEnd = String(next.periodEnd ?? '')
  if (!periodStart || !periodEnd) return next

  const earnings = await req.payload.find({
    collection: 'affiliate-earnings-rows',
    where: {
      and: [
        { recipient: { equals: sourceEmployeeId } },
        { periodStart: { equals: periodStart } },
        { periodEnd: { equals: periodEnd } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  let gross = 0
  for (const row of earnings.docs) {
    const t = Number((row as { totalEarningsUsd?: unknown }).totalEarningsUsd)
    if (Number.isFinite(t)) gross += t
  }

  let aiCosts = 0
  if (rules.costInclusion.ai) {
    const arts = await req.payload.find({
      collection: 'articles',
      where: {
        and: [
          { createdBy: { equals: sourceEmployeeId } },
          { createdAt: { greater_than_equal: periodStart } },
          { createdAt: { less_than_equal: `${String(periodEnd).slice(0, 10)}T23:59:59.999Z` } },
        ],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const a of arts.docs) {
      const c = Number((a as { aiCostUsd?: unknown }).aiCostUsd)
      if (Number.isFinite(c)) aiCosts += c
    }
    const medias = await req.payload.find({
      collection: 'media',
      where: {
        and: [
          { createdBy: { equals: sourceEmployeeId } },
          { createdAt: { greater_than_equal: periodStart } },
          { createdAt: { less_than_equal: `${String(periodEnd).slice(0, 10)}T23:59:59.999Z` } },
        ],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const m of medias.docs) {
      const c = Number((m as { aiCostUsd?: unknown }).aiCostUsd)
      if (Number.isFinite(c)) aiCosts += c
    }
    const siteRows = await req.payload.find({
      collection: 'sites',
      where: {
        and: [
          { createdBy: { equals: sourceEmployeeId } },
          { createdAt: { greater_than_equal: periodStart } },
          { createdAt: { less_than_equal: `${String(periodEnd).slice(0, 10)}T23:59:59.999Z` } },
        ],
      },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const s of siteRows.docs) {
      const c = Number((s as { aiCostUsd?: unknown }).aiCostUsd)
      if (Number.isFinite(c)) aiCosts += c
    }
  }

  const adj =
    kind === 'employee'
      ? Number(
          next.adjustmentsUsd ??
            (originalDoc as { adjustmentsUsd?: unknown })?.adjustmentsUsd ??
            0,
        ) || 0
      : 0
  const baseNet = gross - aiCosts
  const netForPayout = kind === 'employee' ? baseNet + adj : baseNet

  const srcUser = await loadUser(req.payload, sourceEmployeeId)
  if (!srcUser) return next

  let pct = 0
  if (kind === 'employee') {
    pct =
      srcUser.profitSharePct != null && Number.isFinite(Number(srcUser.profitSharePct))
        ? Number(srcUser.profitSharePct)
        : rules.defaultEmployeePct
  } else if (kind === 'leader_cut') {
    const leadId = relId(srcUser.teamLead)
    const lead = leadId ? await loadUser(req.payload, leadId) : null
    pct =
      lead?.leaderCutPctOverride != null && Number.isFinite(Number(lead.leaderCutPctOverride))
        ? Number(lead.leaderCutPctOverride)
        : rules.defaultLeaderCutPct
  } else if (kind === 'ops_cut') {
    const opsId = relId(srcUser.opsManager)
    const ops = opsId ? await loadUser(req.payload, opsId) : null
    pct =
      ops?.opsCutPctOverride != null && Number.isFinite(Number(ops.opsCutPctOverride))
        ? Number(ops.opsCutPctOverride)
        : rules.defaultOpsCutPct
  }

  const payout = roundMoney((netForPayout * pct) / 100, rules.roundingMode)

  next.grossEarningsUsd = Math.round(gross * 100) / 100
  next.aiCostsUsd = Math.round(aiCosts * 100) / 100
  next.adjustmentsUsd = kind === 'employee' ? adj : 0
  next.netProfitUsd = Math.round(netForPayout * 100) / 100
  next.pctApplied = pct
  next.payoutAmountUsd = payout
  next.lines = {
    earningsRowIds: earnings.docs.map((d) => (d as { id: number }).id),
    rulesSnapshot: rules,
  }

  return next
}
